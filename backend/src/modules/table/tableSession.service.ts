import {
  OrderStatus,
  Prisma,
  StaffRole,
  TableSessionEventType,
  TableSessionStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { generateJoinPin, generateQrKey } from "../tableGuest/guestToken";
import { getSiteSettings } from "../siteContent/siteContent.service";
import { callCounts, emitTableUpdated, emitToFloor, summariseOrders, touchTableSession } from "./tableNotify";
import { deriveTableState } from "./tableState";
import { TableStaffError } from "./tableErrors";
import { cancelOpenCallsInTransaction, emitCallsCancelled, OPEN_CALL_STATUSES } from "./tableCall.service";

// Staff side of Table QR sessions (docs/TABLE_QR_SPEC.md §3.1, §4.2). Every refusal carries a code the
// POS branches on, and every state change is a conditional write, so a lost race answers 409 instead of
// overwriting.

export { TableStaffError };

const sessionNotFound = () => new TableStaffError(404, "NOT_FOUND", "Table session not found");
const sessionNotOpen = () => new TableStaffError(409, "SESSION_NOT_OPEN", "This table session is no longer open");

// Who may be a table's waiter (receive its calls): an active login that works the floor.
const WAITER_ROLES: StaffRole[] = [StaffRole.ORDER_TAKER, StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN];

export async function assertWaiter(staffId: string): Promise<void> {
  const staff = await prisma.staffUser.findUnique({ where: { id: staffId }, select: { isActive: true, role: true } });
  if (!staff || !staff.isActive || !WAITER_ROLES.includes(staff.role)) {
    throw new TableStaffError(400, "BAD_WAITER", "waiterStaffId must be an active order taker, POS admin or super admin");
  }
}

// An order still in any of these keeps a table open (phase 1: it must be completed or cancelled first).
const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.AWAITING_RECEPTION,
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
];

async function recordSessionEvent(
  tx: Prisma.TransactionClient,
  data: {
    sessionId: string;
    type: TableSessionEventType;
    actorId?: string | null;
    guestId?: string | null;
    reason?: string | null;
    before?: Prisma.InputJsonValue;
    after?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.tableSessionEvent.create({
    data: {
      sessionId: data.sessionId,
      type: data.type,
      actorId: data.actorId ?? null,
      guestId: data.guestId ?? null,
      reason: data.reason ? data.reason.slice(0, 200) : null,
      ...(data.before !== undefined ? { before: data.before } : {}),
      ...(data.after !== undefined ? { after: data.after } : {}),
    },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function sessionUpdatedPayload(session: { id: string; diningAreaId: string; status: TableSessionStatus }) {
  return { sessionId: session.id, diningAreaId: session.diningAreaId, status: session.status };
}

// ================= Seat =================

export async function seatTable(diningAreaId: string, actor: { id: string; role: StaffRole }, waiterStaffId?: string | null) {
  const table = await prisma.diningArea.findUnique({
    where: { id: diningAreaId },
    select: { id: true, isActive: true, outOfService: true, defaultWaiterStaffId: true },
  });
  if (!table) {
    throw new TableStaffError(404, "NOT_FOUND", "Table not found");
  }
  if (!table.isActive || table.outOfService) {
    throw new TableStaffError(409, "TABLE_UNAVAILABLE", "This table is out of service");
  }
  const day = await prisma.businessDay.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!day) {
    throw new TableStaffError(409, "NO_BUSINESS_DAY", "Start the business day before seating a table");
  }
  // The usual case answered up front; the partial unique index (below) catches a true race.
  const alreadyOpen = await prisma.tableSession.findFirst({
    where: { diningAreaId, status: TableSessionStatus.OPEN },
    select: { id: true },
  });
  if (alreadyOpen) {
    throw new TableStaffError(409, "TABLE_OCCUPIED", "This table is already seated", { sessionId: alreadyOpen.id });
  }

  // The waiter: as asked; else the table's default (if still usable); else the order taker seating it.
  let waiter: string | null = null;
  if (waiterStaffId) {
    await assertWaiter(waiterStaffId);
    waiter = waiterStaffId;
  } else if (waiterStaffId === undefined) {
    if (table.defaultWaiterStaffId) {
      waiter = await assertWaiter(table.defaultWaiterStaffId).then(
        () => table.defaultWaiterStaffId,
        () => null,
      );
    }
    if (waiter === null && actor.role === StaffRole.ORDER_TAKER) {
      waiter = actor.id;
    }
  }

  const settings = await getSiteSettings();
  const pin = settings.tableQrRequirePin ? generateJoinPin() : null;

  let session;
  try {
    session = await prisma.$transaction(async (tx) => {
      const created = await tx.tableSession.create({
        data: {
          diningAreaId,
          businessDayId: day.id,
          joinPin: pin,
          waiterStaffId: waiter,
          seatedById: actor.id,
        },
        select: { id: true, diningAreaId: true, status: true, seatedAt: true, waiterStaff: { select: { id: true, name: true } } },
      });
      await recordSessionEvent(tx, {
        sessionId: created.id,
        type: TableSessionEventType.SEATED,
        actorId: actor.id,
        after: { waiterStaffId: waiter, pin: pin !== null },
      });
      return created;
    });
  } catch (error) {
    // The partial unique index: this table already has an OPEN session (two staff seated it at once).
    if (isUniqueViolation(error)) {
      const open = await prisma.tableSession.findFirst({
        where: { diningAreaId, status: TableSessionStatus.OPEN },
        select: { id: true },
      });
      throw new TableStaffError(409, "TABLE_OCCUPIED", "This table is already seated", { sessionId: open?.id ?? null });
    }
    throw error;
  }

  emitToFloor("table-session:updated", sessionUpdatedPayload(session));
  await emitTableUpdated(diningAreaId);
  return {
    session: { id: session.id, seatedAt: session.seatedAt, waiter: session.waiterStaff },
    pin,
  };
}

// ================= Session detail =================

const lineGuest = { select: { id: true, displayName: true } } as const;

export async function getSessionDetail(id: string) {
  const session = await prisma.tableSession.findUnique({
    where: { id },
    include: {
      diningArea: { select: { id: true, name: true, area: true, capacity: true } },
      waiterStaff: { select: { id: true, name: true } },
      seatedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      guests: {
        select: { id: true, displayName: true, joinOrder: true, createdAt: true, lastSeenAt: true, revokedAt: true },
        orderBy: { joinOrder: "asc" },
      },
      orders: {
        include: {
          items: { include: { menuItem: { select: { id: true, name: true } }, tableGuest: lineGuest } },
          dealLines: { include: { tableGuest: lineGuest } },
          tableGuest: lineGuest,
        },
        orderBy: { createdAt: "asc" },
      },
      events: { include: { actor: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!session) {
    throw sessionNotFound();
  }
  const { diningArea, guests, events, joinPin, ...rest } = session;
  return {
    session: { ...rest, pin: joinPin },
    table: diningArea,
    guests: guests.map(({ revokedAt, createdAt, ...guest }) => ({ ...guest, joinedAt: createdAt, revoked: revokedAt !== null })),
    orders: session.orders,
    events: events.map(({ actor, ...event }) => ({ ...event, actorName: actor?.name ?? null })),
  };
}

async function loadOpenSession(id: string) {
  const session = await prisma.tableSession.findUnique({
    where: { id },
    select: { id: true, diningAreaId: true, status: true, joinPin: true, waiterStaffId: true },
  });
  if (!session) {
    throw sessionNotFound();
  }
  if (session.status !== TableSessionStatus.OPEN) {
    throw sessionNotOpen();
  }
  return session;
}

// Conditional on the session still being OPEN, inside `tx`; throws SESSION_NOT_OPEN when a close/void won.
async function updateOpenSession(tx: Prisma.TransactionClient, id: string, data: Prisma.TableSessionUncheckedUpdateManyInput) {
  const result = await tx.tableSession.updateMany({ where: { id, status: TableSessionStatus.OPEN }, data });
  if (result.count === 0) {
    throw sessionNotOpen();
  }
}

// ================= Waiter, PIN, guests =================

export async function setWaiter(id: string, waiterStaffId: string | null, actorId: string) {
  const session = await loadOpenSession(id);
  if (waiterStaffId !== null) {
    await assertWaiter(waiterStaffId);
  }
  await prisma.$transaction(async (tx) => {
    await updateOpenSession(tx, id, { waiterStaffId });
    await recordSessionEvent(tx, {
      sessionId: id,
      type: TableSessionEventType.WAITER_CHANGED,
      actorId,
      before: { waiterStaffId: session.waiterStaffId },
      after: { waiterStaffId },
    });
  });
  emitToFloor("table-session:updated", sessionUpdatedPayload(session));
  return getSessionDetail(id);
}

export async function rotatePin(id: string, actorId: string) {
  const session = await loadOpenSession(id);
  if (session.joinPin === null) {
    throw new TableStaffError(409, "PIN_NOT_ENABLED", "This table was seated without a PIN");
  }
  const pin = generateJoinPin();
  await prisma.$transaction(async (tx) => {
    await updateOpenSession(tx, id, { joinPin: pin, pinFailures: 0 });
    await recordSessionEvent(tx, { sessionId: id, type: TableSessionEventType.PIN_ROTATED, actorId });
  });
  emitToFloor("table-session:updated", sessionUpdatedPayload(session));
  return { pin };
}

export async function removeGuest(id: string, guestId: string, actorId: string, reason: string | null) {
  const session = await loadOpenSession(id);
  const guest = await prisma.tableGuest.findFirst({ where: { id: guestId, sessionId: id }, select: { id: true, displayName: true } });
  if (!guest) {
    throw new TableStaffError(404, "NOT_FOUND", "Guest not found");
  }
  await prisma.$transaction(async (tx) => {
    await tx.tableGuest.updateMany({
      where: { id: guestId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actorId },
    });
    await recordSessionEvent(tx, {
      sessionId: id,
      type: TableSessionEventType.GUEST_REMOVED,
      actorId,
      guestId,
      reason,
      after: { displayName: guest.displayName },
    });
    await touchTableSession(tx, id);
  });
  emitToFloor("table-session:updated", sessionUpdatedPayload(session));
  await emitTableUpdated(session.diningAreaId);
  return { guest: { id: guest.id, displayName: guest.displayName, revoked: true } };
}

// ================= Close / void =================

// Phase 1: a table closes once none of its orders is still open (each completed or cancelled). Every
// guest token dies with it (tokens are only valid while the session is OPEN).
export async function closeSession(id: string, actorId: string) {
  const session = await loadOpenSession(id);
  const openOrders = await prisma.order.findMany({
    where: { tableSessionId: id, status: { in: OPEN_ORDER_STATUSES } },
    select: { id: true, orderNumber: true, status: true },
  });
  if (openOrders.length > 0) {
    throw new TableStaffError(409, "SESSION_HAS_OPEN_ORDERS", "Complete or cancel this table's open orders first", {
      orderIds: openOrders.map((order) => order.id),
      openOrders,
    });
  }
  const closed = await prisma.$transaction(async (tx) => {
    // The update row-locks the session; a guest's round locks the same row in its guard. So either the
    // round committed first and is counted here (the close rolls back), or it sees CLOSED and is refused.
    await updateOpenSession(tx, id, { status: TableSessionStatus.CLOSED, closedAt: new Date(), closedById: actorId, version: { increment: 1 } });
    const raced = await tx.order.count({ where: { tableSessionId: id, status: { in: OPEN_ORDER_STATUSES } } });
    if (raced > 0) {
      throw new TableStaffError(409, "SESSION_HAS_OPEN_ORDERS", "A new order just arrived for this table");
    }
    await recordSessionEvent(tx, { sessionId: id, type: TableSessionEventType.CLOSED, actorId });
    // Calls still open at a closed table are moot: cancelled with it.
    const cancelledCalls = await cancelOpenCallsInTransaction(tx, id);
    const session = await tx.tableSession.findUniqueOrThrow({ where: { id }, select: { id: true, diningAreaId: true, status: true, closedAt: true } });
    return { session, cancelledCalls };
  });
  await emitCallsCancelled(closed.cancelledCalls);
  emitToFloor("table-session:updated", sessionUpdatedPayload(closed.session));
  await emitTableUpdated(session.diningAreaId);
  return { session: closed.session };
}

// Seated by mistake / guests left before anything was accepted. Rounds still waiting at reception are
// rejected first (through the normal reject, so reception's inbox and the audit trail stay right).
export async function voidSession(
  id: string,
  actorId: string,
  reason: string,
  rejectAwaiting: (orderId: string) => Promise<unknown>,
) {
  const session = await loadOpenSession(id);
  const orders = await prisma.order.findMany({ where: { tableSessionId: id }, select: { id: true, status: true } });
  if (orders.some((order) => order.status !== OrderStatus.CANCELLED && order.status !== OrderStatus.AWAITING_RECEPTION)) {
    throw new TableStaffError(409, "SESSION_HAS_ORDERS", "This table has accepted orders — complete or cancel them, then close it");
  }
  for (const order of orders.filter((o) => o.status === OrderStatus.AWAITING_RECEPTION)) {
    await rejectAwaiting(order.id);
  }
  const voided = await prisma.$transaction(async (tx) => {
    // Update first (row lock), then re-count — same reasoning as closeSession.
    await updateOpenSession(tx, id, {
      status: TableSessionStatus.VOIDED,
      closedAt: new Date(),
      closedById: actorId,
      voidReason: reason,
      version: { increment: 1 },
    });
    const remaining = await tx.order.count({
      where: { tableSessionId: id, status: { notIn: [OrderStatus.CANCELLED] } },
    });
    if (remaining > 0) {
      throw new TableStaffError(409, "SESSION_HAS_ORDERS", "An order for this table changed meanwhile — reload and try again");
    }
    await recordSessionEvent(tx, { sessionId: id, type: TableSessionEventType.VOIDED, actorId, reason });
    const cancelledCalls = await cancelOpenCallsInTransaction(tx, id);
    const session = await tx.tableSession.findUniqueOrThrow({ where: { id }, select: { id: true, diningAreaId: true, status: true, closedAt: true, voidReason: true } });
    return { session, cancelledCalls };
  });
  await emitCallsCancelled(voided.cancelledCalls);
  emitToFloor("table-session:updated", sessionUpdatedPayload(voided.session));
  await emitTableUpdated(session.diningAreaId);
  return { session: voided.session };
}

// ================= Floor map =================

export async function getFloor(area?: string) {
  const tables = await prisma.diningArea.findMany({
    where: { isActive: true, ...(area !== undefined ? { area: area === "" ? null : area } : {}) },
    select: {
      id: true,
      name: true,
      area: true,
      type: true,
      capacity: true,
      layoutX: true,
      layoutY: true,
      layoutW: true,
      layoutH: true,
      shape: true,
      rotation: true,
      outOfService: true,
      tableSessions: {
        where: { status: TableSessionStatus.OPEN },
        select: {
          id: true,
          seatedAt: true,
          waiterStaff: { select: { id: true, name: true } },
          guests: { where: { revokedAt: null }, select: { id: true } },
          orders: { select: { status: true, items: { select: { status: true } } } },
          calls: {
            where: { status: { in: OPEN_CALL_STATUSES } },
            select: { id: true, type: true, status: true, createdAt: true, escalatedAt: true },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  const areas = [...new Set((await prisma.diningArea.findMany({ where: { isActive: true }, select: { area: true } })).map((t) => t.area ?? ""))]
    .sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)));

  return {
    areas,
    tables: tables.map((table) => {
      const session = table.tableSessions[0] ?? null;
      const counts = summariseOrders(session?.orders ?? []);
      const derived = deriveTableState({
        outOfService: table.outOfService,
        hasOpenSession: session !== null,
        billRequested: false,
        sharesPaidOrSubmitted: 0,
        ...callCounts(session?.calls ?? []),
        ...counts,
      });
      const placed = table.layoutX !== null && table.layoutY !== null && table.layoutW !== null && table.layoutH !== null;
      return {
        id: table.id,
        name: table.name,
        area: table.area,
        type: table.type,
        capacity: table.capacity,
        layout: placed
          ? { x: table.layoutX, y: table.layoutY, w: table.layoutW, h: table.layoutH, shape: table.shape, rotation: table.rotation }
          : null,
        outOfService: table.outOfService,
        state: derived.state,
        attention: derived.attention,
        readyCount: derived.readyCount,
        session: session
          ? {
              id: session.id,
              seatedAt: session.seatedAt,
              waiter: session.waiterStaff,
              guestCount: session.guests.length,
              awaitingCount: counts.awaitingOrders,
              openCalls: session.calls.map((call) => ({
                id: call.id,
                type: call.type,
                status: call.status,
                createdAt: call.createdAt,
                escalated: call.escalatedAt !== null,
              })),
              bill: null,
            }
          : null,
      };
    }),
  };
}

// ================= Layout =================

export interface LayoutEntry {
  id: string;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  shape?: "RECT" | "ROUND";
  rotation?: number;
}

export async function saveLayout(entries: LayoutEntry[]) {
  const ids = [...new Set(entries.map((entry) => entry.id))];
  const found = await prisma.diningArea.count({ where: { id: { in: ids } } });
  if (found !== ids.length) {
    throw new TableStaffError(404, "NOT_FOUND", "One or more tables were not found; nothing was saved");
  }
  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      await tx.diningArea.update({
        where: { id: entry.id },
        data: {
          layoutX: entry.x,
          layoutY: entry.y,
          layoutW: entry.w,
          layoutH: entry.h,
          ...(entry.shape !== undefined ? { shape: entry.shape } : {}),
          ...(entry.rotation !== undefined ? { rotation: entry.rotation } : {}),
        },
      });
    }
  });
  for (const id of ids) {
    await emitTableUpdated(id);
  }
  return { updated: entries.length };
}

// ================= QR keys =================

async function assignNewQrKey(id: string): Promise<string> {
  // 128 random bits: a collision is effectively impossible, but the unique index is the backstop.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const updated = await prisma.diningArea.update({ where: { id }, data: { qrKey: generateQrKey() }, select: { qrKey: true } });
      return updated.qrKey as string;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
  throw new Error("Could not allocate a unique QR key");
}

// The print sheet: every active table with its QR key, generating keys for tables that have none yet.
export async function getQrSheet(area?: string) {
  const tables = await prisma.diningArea.findMany({
    where: { isActive: true, ...(area !== undefined ? { area: area === "" ? null : area } : {}) },
    select: { id: true, name: true, area: true, qrKey: true },
    orderBy: { name: "asc" },
  });
  for (const table of tables) {
    if (table.qrKey === null) {
      table.qrKey = await assignNewQrKey(table.id);
    }
  }
  return { tables };
}

// A new key: the printed QR stops working at once. Guests already in a session keep their tokens.
export async function regenerateQrKey(id: string) {
  const exists = await prisma.diningArea.findUnique({ where: { id }, select: { id: true } });
  if (!exists) {
    throw new TableStaffError(404, "NOT_FOUND", "Dining area not found");
  }
  return { id, qrKey: await assignNewQrKey(id) };
}
