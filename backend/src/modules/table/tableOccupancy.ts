import { randomUUID } from "crypto";
import {
  OrderStatus,
  Prisma,
  StaffRole,
  TableCallStatus,
  TableSessionEventType,
  TableSessionOpenedVia,
  TableSessionStatus,
} from "../../../generated/prisma/client";
import { getSiteSettings } from "../siteContent/siteContent.service";
import { generateJoinPin } from "../tableGuest/guestToken";
import { TableStaffError } from "./tableErrors";

// Table sync (docs/TABLE_SYNC_SPEC.md R2, R5, R10): who sits at a table is the table's one OPEN session,
// opened on demand by whatever puts the first order there. Everything here runs inside the caller's
// transaction. Lock order, everywhere: per-day advisory lock (order creation only) → DiningArea rows (by
// id) → TableSession rows (by id) → Order rows → TableBill → TableBillShare.
// Imports nothing from order.service, so order.service can call it without a cycle.

type Tx = Prisma.TransactionClient;

/** Sessions that an order (not a person pressing Seat) opened: they free themselves when they empty (R5). */
export const SELF_RELEASING_VIAS: TableSessionOpenedVia[] = [
  TableSessionOpenedVia.STAFF_ORDER,
  TableSessionOpenedVia.SCHEDULED_ORDER,
  TableSessionOpenedVia.MIGRATION,
  TableSessionOpenedVia.SPLIT_OFF,
];

const OPEN_CALLS: TableCallStatus[] = [TableCallStatus.RAISED, TableCallStatus.ACKNOWLEDGED];

// Who may be a table's waiter (receive its calls): an active login that works the floor.
const WAITER_ROLES: StaffRole[] = [StaffRole.ORDER_TAKER, StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN];

const timeFormat = new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" });

// ================= Locks =================

export interface LockedTable {
  id: string;
  name: string;
  isActive: boolean;
  outOfService: boolean;
  defaultWaiterStaffId: string | null;
}

/** Locks one table row (FOR UPDATE): whoever opens a session on it next waits for this transaction. */
export async function lockTable(tx: Tx, diningAreaId: string): Promise<LockedTable | null> {
  const rows = await tx.$queryRaw<LockedTable[]>`
    SELECT "id", "name", "isActive", "outOfService", "defaultWaiterStaffId" FROM "DiningArea" WHERE "id" = ${diningAreaId} FOR UPDATE`;
  return rows[0] ?? null;
}

/** Locks several tables in id order (two moves in opposite directions can't deadlock). */
export async function lockTables(tx: Tx, ids: string[]): Promise<Map<string, LockedTable>> {
  const locked = new Map<string, LockedTable>();
  for (const id of [...new Set(ids)].sort()) {
    const row = await lockTable(tx, id);
    if (row) {
      locked.set(id, row);
    }
  }
  return locked;
}

export async function lockSession(tx: Tx, sessionId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "TableSession" WHERE "id" = ${sessionId} FOR UPDATE`;
}

/** Locks several sessions in id order. */
export async function lockSessions(tx: Tx, ids: string[]): Promise<void> {
  for (const id of [...new Set(ids)].sort()) {
    await lockSession(tx, id);
  }
}

/**
 * The first statement of an order transaction that can change a table's money or membership (R10): locks
 * the order's session row, so the order → bill and bill → order paths both start at the session and can't
 * deadlock. Returns the session id (null for an order not at a table).
 */
export async function lockTableForOrder(tx: Tx, orderId: string): Promise<string | null> {
  const before = await tx.order.findUnique({ where: { id: orderId }, select: { tableSessionId: true } });
  if (!before?.tableSessionId) {
    return null;
  }
  await lockSession(tx, before.tableSessionId);
  // A move may have re-pointed the order while we waited for the lock.
  const after = await tx.order.findUnique({ where: { id: orderId }, select: { tableSessionId: true } });
  if (after?.tableSessionId && after.tableSessionId !== before.tableSessionId) {
    await lockSession(tx, after.tableSessionId);
  }
  return after?.tableSessionId ?? null;
}

// ================= Summaries (the body of every table conflict) =================

export interface SessionSummary {
  id: string;
  tableName: string;
  openedAt: Date;
  openedVia: TableSessionOpenedVia;
  orderCount: number;
  total: string;
  guestCount: number;
  fromPreviousDay: boolean;
}

export async function summariseSession(tx: Tx, sessionId: string): Promise<SessionSummary> {
  const [session, activeDay] = await Promise.all([
    tx.tableSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        id: true,
        seatedAt: true,
        openedVia: true,
        businessDayId: true,
        diningArea: { select: { name: true } },
        orders: { where: { status: { not: OrderStatus.CANCELLED } }, select: { totalAmount: true } },
        _count: { select: { guests: { where: { revokedAt: null } } } },
      },
    }),
    tx.businessDay.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);
  return {
    id: session.id,
    tableName: session.diningArea.name,
    openedAt: session.seatedAt,
    openedVia: session.openedVia,
    orderCount: session.orders.length,
    total: session.orders.reduce((sum, order) => sum.plus(order.totalAmount), new Prisma.Decimal(0)).toFixed(2),
    guestCount: session._count.guests,
    fromPreviousDay: activeDay?.id !== session.businessDayId,
  };
}

function describe(summary: SessionSummary): string {
  const orders = `${summary.orderCount} ${summary.orderCount === 1 ? "order" : "orders"}`;
  return `since ${timeFormat.format(summary.openedAt)} · ${orders} · Rs ${summary.total}`;
}

export const tableOccupied = (summary: SessionSummary) =>
  new TableStaffError(409, "TABLE_OCCUPIED", `${summary.tableName} is already open (${describe(summary)}). Add this order to it?`, {
    sessionId: summary.id,
    session: summary,
  });

export const tableStateChanged = (tableName: string, summary: SessionSummary | null) =>
  new TableStaffError(409, "TABLE_STATE_CHANGED", `${tableName} changed while you were ordering. Check it and send again.`, {
    session: summary,
  });

export const tableFromPreviousDay = (summary: SessionSummary) =>
  new TableStaffError(
    409,
    "TABLE_FROM_PREVIOUS_DAY",
    `${summary.tableName} is still open from the previous business day. Settle or close it first.`,
    { session: summary },
  );

export const tableUnavailable = (tableName: string) =>
  new TableStaffError(409, "TABLE_UNAVAILABLE", `${tableName} is out of service.`);

// ================= Opening =================

/** The table's OPEN session row (a merged child too), or null. */
export async function findOpenSessionRow(tx: Tx, diningAreaId: string) {
  return tx.tableSession.findFirst({
    where: { diningAreaId, status: TableSessionStatus.OPEN },
    select: { id: true, businessDayId: true, mergedIntoSessionId: true },
  });
}

async function usableWaiter(tx: Tx, staffId: string | null): Promise<string | null> {
  if (!staffId) {
    return null;
  }
  const staff = await tx.staffUser.findUnique({ where: { id: staffId }, select: { isActive: true, role: true } });
  return staff && staff.isActive && WAITER_ROLES.includes(staff.role) ? staffId : null;
}

export interface InsertSessionInput {
  diningAreaId: string;
  businessDayId: string;
  seatedById: string;
  waiterStaffId: string | null;
  joinPin: string | null;
  via: TableSessionOpenedVia;
  openedByOrderId?: string | null;
}

/**
 * Inserts an OPEN session unless the table already has one. `ON CONFLICT … DO NOTHING` on the partial unique
 * index means a lost race never aborts the caller's transaction (a plain insert's unique violation would);
 * the caller re-reads and retries instead. Returns the new id, or null when another session won.
 */
export async function insertOpenSession(tx: Tx, input: InsertSessionInput): Promise<string | null> {
  const id = randomUUID();
  const rows = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "TableSession"
      ("id", "diningAreaId", "businessDayId", "status", "joinPin", "waiterStaffId", "seatedById", "openedVia", "openedByOrderId",
       "pinFailures", "version", "seatedAt", "createdAt", "updatedAt")
    VALUES
      (${id}, ${input.diningAreaId}, ${input.businessDayId}, 'OPEN', ${input.joinPin}, ${input.waiterStaffId}, ${input.seatedById},
       ${input.via}::"TableSessionOpenedVia", ${input.openedByOrderId ?? null}, 0, 0, now(), now(), now())
    ON CONFLICT ("diningAreaId") WHERE "status" = 'OPEN' DO NOTHING
    RETURNING "id"`;
  return rows[0]?.id ?? null;
}

export interface EnsureOpenSessionInput {
  diningAreaId: string;
  /**
   * What the caller saw: null = "I believe the table is free", an id = "add to this session". Undefined =
   * join whatever is open (internal callers only: the demo seed, the scheduled release). See R2 change 1.
   */
  expectedTableSessionId: string | null | undefined;
  businessDayId: string;
  opener: { staffId: string; role: StaffRole | null };
  via: typeof TableSessionOpenedVia.STAFF_ORDER | typeof TableSessionOpenedVia.SCHEDULED_ORDER;
}

export interface EnsuredSession {
  sessionId: string;
  opened: boolean;
  pin: string | null;
}

/**
 * Every dine-in order with a table goes through here (R2): finds the table's open session (a merged child
 * resolves to its parent) or opens one. Race-safe: the table row is locked first, and the insert can't
 * collide with a session opened without that lock (it retries on the partial unique index).
 */
export async function ensureOpenSession(tx: Tx, input: EnsureOpenSessionInput): Promise<EnsuredSession> {
  const table = await lockTable(tx, input.diningAreaId);
  if (!table) {
    throw new TableStaffError(404, "NOT_FOUND", "Table not found");
  }
  if (!table.isActive || table.outOfService) {
    throw tableUnavailable(table.name);
  }
  const expected = input.expectedTableSessionId;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const open = await findOpenSessionRow(tx, input.diningAreaId);
    if (open) {
      const parentId = open.mergedIntoSessionId ?? open.id;
      await lockSession(tx, parentId);
      const parent = await tx.tableSession.findUniqueOrThrow({ where: { id: parentId }, select: { id: true, businessDayId: true } });
      if (expected !== undefined && expected !== parent.id && expected !== open.id) {
        const summary = await summariseSession(tx, parent.id);
        throw expected === null ? tableOccupied(summary) : tableStateChanged(table.name, summary);
      }
      if (parent.businessDayId !== input.businessDayId) {
        throw tableFromPreviousDay(await summariseSession(tx, parent.id));
      }
      return { sessionId: parent.id, opened: false, pin: null };
    }
    if (typeof expected === "string") {
      throw tableStateChanged(table.name, null);
    }
    const settings = await getSiteSettings();
    const pin = settings.tableQrRequirePin ? generateJoinPin() : null;
    const waiter =
      input.opener.role === StaffRole.ORDER_TAKER
        ? input.opener.staffId
        : await usableWaiter(tx, table.defaultWaiterStaffId);
    const id = await insertOpenSession(tx, {
      diningAreaId: input.diningAreaId,
      businessDayId: input.businessDayId,
      seatedById: input.opener.staffId,
      waiterStaffId: waiter,
      joinPin: pin,
      via: input.via,
    });
    if (id) {
      await tx.tableSessionEvent.create({
        data: { sessionId: id, type: TableSessionEventType.OPENED_BY_ORDER, actorId: input.opener.staffId, after: { via: input.via, pin: pin !== null } },
      });
      return { sessionId: id, opened: true, pin };
    }
    // Lost the insert to a session opened without the table lock: read it and decide again.
  }
  throw new Error(`ensureOpenSession: could not settle table ${input.diningAreaId}`);
}

// ================= Releasing =================

/**
 * Auto-release (R5): a session an ORDER opened, once nothing is left on it — no non-cancelled order, no
 * active guest, no open call, no merged child — is voided in the caller's transaction. A session someone
 * seated on purpose is never released here. Returns the table id when it released one.
 */
export async function releaseIfIdle(tx: Tx, sessionId: string, actorId: string | null): Promise<string | null> {
  const session = await tx.tableSession.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      openedVia: true,
      mergedIntoSessionId: true,
      diningAreaId: true,
      _count: {
        select: {
          orders: { where: { status: { not: OrderStatus.CANCELLED } } },
          guests: { where: { revokedAt: null } },
          calls: { where: { status: { in: OPEN_CALLS } } },
          mergedChildren: { where: { status: TableSessionStatus.OPEN } },
        },
      },
    },
  });
  if (
    !session ||
    session.status !== TableSessionStatus.OPEN ||
    session.mergedIntoSessionId !== null ||
    !SELF_RELEASING_VIAS.includes(session.openedVia) ||
    session._count.orders > 0 ||
    session._count.guests > 0 ||
    session._count.calls > 0 ||
    session._count.mergedChildren > 0
  ) {
    return null;
  }
  const released = await tx.tableSession.updateMany({
    where: { id: sessionId, status: TableSessionStatus.OPEN },
    data: {
      status: TableSessionStatus.VOIDED,
      closedAt: new Date(),
      closedById: actorId,
      voidReason: "All orders cancelled",
      version: { increment: 1 },
    },
  });
  if (released.count === 0) {
    return null;
  }
  await tx.tableSessionEvent.create({ data: { sessionId, type: TableSessionEventType.AUTO_RELEASED, actorId, reason: "All orders cancelled" } });
  return session.diningAreaId;
}

/** releaseIfIdle for the session an order belongs to. */
export async function releaseIfIdleForOrder(tx: Tx, orderId: string, actorId: string | null): Promise<string | null> {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { tableSessionId: true } });
  return order?.tableSessionId ? releaseIfIdle(tx, order.tableSessionId, actorId) : null;
}
