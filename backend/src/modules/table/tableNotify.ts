import {
  OrderItemStatus,
  OrderStatus,
  Prisma,
  TableBillStatus,
  TableCallStatus,
  TableCallType,
  TableSessionStatus,
  TableShareStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { getIO } from "../../config/socket";
import { DerivedTableState, deriveTableState } from "./tableState";

// Shared by every module that changes something a table's floor-map tile or a guest's poll shows
// (table sessions, guest joins, and order changes in order.service). Deliberately imports nothing
// from order.service, so order.service can call it without an import cycle.

// Rooms that watch the floor map: reception/admins and every order taker.
export const FLOOR_ROOMS = ["pos-admin", "order-takers"] as const;

const KITCHEN_ITEM_STATUSES: OrderItemStatus[] = [OrderItemStatus.PENDING, OrderItemStatus.PREPARING, OrderItemStatus.READY];

type Db = Prisma.TransactionClient | typeof prisma;

// Open calls are RAISED or ACKNOWLEDGED (declared here, not imported from tableCall.service, which
// imports this file).
const OPEN_CALL_STATUSES_FOR_STATE: TableCallStatus[] = [TableCallStatus.RAISED, TableCallStatus.ACKNOWLEDGED];

// The open session's open calls summarised into the counts deriveTableState reads.
export function callCounts(
  calls: { type: TableCallType; escalatedAt: Date | null }[],
): Pick<Parameters<typeof deriveTableState>[0], "openCalls" | "escalatedCalls" | "openBillCashCall"> {
  return {
    openCalls: calls.length,
    escalatedCalls: calls.filter((call) => call.escalatedAt !== null).length,
    // Phase 1's BILL_REQUESTED: a guest asked for the bill to pay cash (spec §3.7, Conflict C10).
    openBillCashCall: calls.some((call) => call.type === TableCallType.BILL_CASH),
  };
}

// The open session's orders summarised into the counts deriveTableState reads.
export function summariseOrders(
  orders: { status: OrderStatus; items: { status: OrderItemStatus }[] }[],
): Pick<Parameters<typeof deriveTableState>[0], "awaitingOrders" | "kitchenItems" | "readyItems" | "acceptedOrders"> {
  let awaitingOrders = 0;
  let kitchenItems = 0;
  let readyItems = 0;
  let acceptedOrders = 0;
  for (const order of orders) {
    if (order.status === OrderStatus.AWAITING_RECEPTION) {
      awaitingOrders += 1;
      continue;
    }
    if (order.status === OrderStatus.CANCELLED) {
      continue;
    }
    acceptedOrders += 1;
    for (const item of order.items) {
      if (KITCHEN_ITEM_STATUSES.includes(item.status)) {
        kitchenItems += 1;
      }
      if (item.status === OrderItemStatus.READY) {
        readyItems += 1;
      }
    }
  }
  return { awaitingOrders, kitchenItems, readyItems, acceptedOrders };
}

// ---------- The bill (phase 2) ----------

// A share with money attached: the split can't be rebuilt or cancelled while one exists.
export const SHARE_STATUSES_WITH_MONEY: TableShareStatus[] = [TableShareStatus.PROOF_SUBMITTED, TableShareStatus.VERIFIED];

export interface BillSummary {
  status: TableBillStatus;
  /** Shares of the current split that are VERIFIED. */
  paid: number;
  /** Shares of the current split (0 before a split, or after it was cancelled). */
  of: number;
  /** VERIFIED or PROOF_SUBMITTED: drives the map's PAYING state. */
  paidOrSubmitted: number;
}

// The session's bill as the floor map and "table-bill:updated" show it; null when there is no bill.
export async function loadBillSummary(db: Db, sessionId: string): Promise<BillSummary | null> {
  const bill = await db.tableBill.findUnique({
    where: { sessionId },
    select: { status: true, splitVersion: true, shares: { select: { status: true, splitVersion: true } } },
  });
  return summariseBill(bill);
}

/** The pure part of loadBillSummary (getFloor reads the bills in its own query). */
export function summariseBill(
  bill: { status: TableBillStatus; splitVersion: number; shares: { status: TableShareStatus; splitVersion: number }[] } | null,
): BillSummary | null {
  if (!bill) {
    return null;
  }
  const live = bill.shares.filter((share) => share.splitVersion === bill.splitVersion && share.status !== TableShareStatus.VOID);
  return {
    status: bill.status,
    paid: live.filter((share) => share.status === TableShareStatus.VERIFIED).length,
    of: live.length,
    paidOrSubmitted: live.filter((share) => SHARE_STATUSES_WITH_MONEY.includes(share.status)).length,
  };
}

// deriveTableState's bill inputs. A PAID bill (waiting only for staff to close) reads as PAYING, all paid.
export function billStateInputs(bill: BillSummary | null): Pick<Parameters<typeof deriveTableState>[0], "billRequested" | "sharesPaidOrSubmitted"> {
  const requested = bill !== null && (bill.status === TableBillStatus.REQUESTED || bill.status === TableBillStatus.PAID);
  return { billRequested: requested, sharesPaidOrSubmitted: requested ? Math.max(bill.paidOrSubmitted, bill.status === TableBillStatus.PAID ? 1 : 0) : 0 };
}

// ---------- The one table-state loader (docs/TABLE_SYNC_SPEC.md R1) ----------

// Everything deriveTableState and the floor tile need from a session. Loaded for the session a table's
// orders actually live on: its own, or — for a table merged into another — its parent's.
const floorSessionSelect = {
  id: true,
  seatedAt: true,
  businessDayId: true,
  openedVia: true,
  openedByOrderId: true,
  diningAreaId: true,
  waiterStaff: { select: { id: true, name: true } },
  guests: { where: { revokedAt: null }, select: { id: true } },
  orders: { select: { status: true, totalAmount: true, items: { select: { status: true } } } },
  calls: {
    where: { status: { in: OPEN_CALL_STATUSES_FOR_STATE } },
    select: { id: true, type: true, status: true, createdAt: true, escalatedAt: true },
    orderBy: { createdAt: "asc" as const },
  },
  bill: { select: { status: true, splitVersion: true, shares: { select: { status: true, splitVersion: true } } } },
  diningArea: { select: { id: true, name: true } },
  mergedChildren: { where: { status: TableSessionStatus.OPEN }, select: { diningArea: { select: { id: true, name: true } } } },
} satisfies Prisma.TableSessionSelect;

const floorTableSelect = {
  id: true,
  name: true,
  area: true,
  type: true,
  capacity: true,
  isActive: true,
  layoutX: true,
  layoutY: true,
  layoutW: true,
  layoutH: true,
  shape: true,
  rotation: true,
  outOfService: true,
  tableSessions: { where: { status: TableSessionStatus.OPEN }, select: { id: true, mergedIntoSessionId: true } },
} satisfies Prisma.DiningAreaSelect;

/**
 * Every table matching `where` with its derived state and its session as the floor map shows it. The ONE
 * place a table's state is computed: GET /tables/floor and every "table:updated" payload come from here.
 */
export async function loadTableStates(db: Db, where: Prisma.DiningAreaWhereInput) {
  const [tables, activeDay] = await Promise.all([
    db.diningArea.findMany({ where, select: floorTableSelect, orderBy: { name: "asc" } }),
    db.businessDay.findFirst({ where: { isActive: true }, select: { id: true } }),
  ]);
  const ownerIds = [...new Set(tables.flatMap((table) => table.tableSessions.map((session) => session.mergedIntoSessionId ?? session.id)))];
  const sessions = ownerIds.length ? await db.tableSession.findMany({ where: { id: { in: ownerIds } }, select: floorSessionSelect }) : [];
  const sessionById = new Map(sessions.map((session) => [session.id, session]));

  return tables.map((table) => {
    const own = table.tableSessions[0] ?? null;
    const session = own ? (sessionById.get(own.mergedIntoSessionId ?? own.id) ?? null) : null;
    const counts = summariseOrders(session?.orders ?? []);
    const bill = summariseBill(session?.bill ?? null);
    const fromPreviousDay = session !== null && session.businessDayId !== activeDay?.id;
    const derived = deriveTableState({
      outOfService: table.outOfService,
      hasOpenSession: session !== null,
      fromPreviousDay,
      ...billStateInputs(bill),
      ...callCounts(session?.calls ?? []),
      ...counts,
    });
    const placed = table.layoutX !== null && table.layoutY !== null && table.layoutW !== null && table.layoutH !== null;
    const live = (session?.orders ?? []).filter((order) => order.status !== OrderStatus.CANCELLED);
    return {
      id: table.id,
      name: table.name,
      area: table.area,
      type: table.type,
      capacity: table.capacity,
      // Only an inactive table that still has an open session is listed (from before a table in use could
      // no longer be switched off); the map flags it.
      inactive: !table.isActive,
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
            bill: bill ? { status: bill.status, paid: bill.paid, of: bill.of } : null,
            openedVia: session.openedVia,
            openedByOrderId: session.openedByOrderId,
            orderCount: live.length,
            total: live.reduce((sum, order) => sum.plus(order.totalAmount), new Prisma.Decimal(0)).toFixed(2),
            fromPreviousDay,
            // This table is merged into another table's session (R7): the tile reads "with <joinedTo>".
            joinedTo: session.diningAreaId !== table.id ? { tableId: session.diningArea.id, name: session.diningArea.name } : null,
            // The tables merged into this session, other than this one.
            joined: session.mergedChildren
              .map((child) => ({ tableId: child.diningArea.id, name: child.diningArea.name }))
              .filter((child) => child.tableId !== table.id),
          }
        : null,
    };
  });
}

export type FloorTable = Awaited<ReturnType<typeof loadTableStates>>[number];

export async function loadTableState(db: Db, diningAreaId: string): Promise<{ sessionId: string | null } & DerivedTableState> {
  const [table] = await loadTableStates(db, { id: diningAreaId });
  return {
    sessionId: table?.session?.id ?? null,
    state: table?.state ?? "EMPTY",
    attention: table?.attention ?? null,
    readyCount: table?.readyCount ?? 0,
  };
}

/** The tables that share one session: the session's own table plus every table merged into it. */
async function mergeGroupTableIds(db: Db, diningAreaId: string): Promise<string[]> {
  const own = await db.tableSession.findFirst({
    where: { diningAreaId, status: TableSessionStatus.OPEN },
    select: { id: true, mergedIntoSessionId: true },
  });
  if (!own) {
    return [diningAreaId];
  }
  const ownerId = own.mergedIntoSessionId ?? own.id;
  const group = await db.tableSession.findMany({
    where: { OR: [{ id: ownerId }, { mergedIntoSessionId: ownerId, status: TableSessionStatus.OPEN }] },
    select: { diningAreaId: true },
  });
  return [...new Set([diningAreaId, ...group.map((session) => session.diningAreaId)])];
}

// Never lets a missing Socket.io (a script, a test without the mock) fail the write that came before.
function emitSafely(emit: () => void): void {
  try {
    emit();
  } catch {
    // No Socket.io in this process — nothing to notify.
  }
}

export function emitToFloor(event: string, payload: unknown): void {
  emitSafely(() => {
    const io = getIO();
    for (const room of FLOOR_ROOMS) {
      io.to(room).emit(event, payload);
    }
  });
}

// "table:updated" with the table's freshly derived state. Fire-and-forget after a commit; a failure is
// logged, never surfaced to the request that caused it.
// Merged tables (R7) all read one session, so a change to it re-emits every table of the group.
export async function emitTableUpdated(diningAreaId: string): Promise<void> {
  await emitTablesUpdated([diningAreaId]);
}

export async function emitTablesUpdated(diningAreaIds: string[]): Promise<void> {
  try {
    const ids = new Set<string>();
    for (const id of new Set(diningAreaIds)) {
      for (const member of await mergeGroupTableIds(prisma, id)) {
        ids.add(member);
      }
    }
    for (const table of await loadTableStates(prisma, { id: { in: [...ids] } })) {
      emitToFloor("table:updated", { diningAreaId: table.id, sessionId: table.session?.id ?? null, state: table.state, attention: table.attention });
    }
  } catch (error) {
    console.error("[table] could not emit table:updated", error);
  }
}

// "table-session:updated" (spec §6.2; table sync adds openedVia and mergedIntoSessionId). After the commit.
export async function emitSessionUpdated(sessionId: string): Promise<void> {
  try {
    const session = await prisma.tableSession.findUnique({
      where: { id: sessionId },
      select: { id: true, diningAreaId: true, status: true, openedVia: true, mergedIntoSessionId: true },
    });
    if (session) {
      emitToFloor("table-session:updated", {
        sessionId: session.id,
        diningAreaId: session.diningAreaId,
        status: session.status,
        openedVia: session.openedVia,
        mergedIntoSessionId: session.mergedIntoSessionId,
      });
    }
  } catch (error) {
    console.error("[table] could not emit table-session:updated", error);
  }
}

// "table-bill:updated" (spec §6.2) after any bill or share change. Fire-and-forget after the commit.
export async function emitTableBillUpdated(sessionId: string): Promise<void> {
  try {
    const session = await prisma.tableSession.findUnique({ where: { id: sessionId }, select: { diningAreaId: true } });
    const bill = await loadBillSummary(prisma, sessionId);
    if (!session || !bill) {
      return;
    }
    emitToFloor("table-bill:updated", { sessionId, diningAreaId: session.diningAreaId, status: bill.status, paid: bill.paid, of: bill.of });
  } catch (error) {
    console.error("[table] could not emit table-bill:updated", error);
  }
}

// Bumps the version a guest's poll ETag is built from. Call inside the transaction that made the change.
export async function touchTableSession(db: Db, sessionId: string): Promise<void> {
  await db.tableSession.updateMany({ where: { id: sessionId }, data: { version: { increment: 1 } } });
}

// For order.service: after an order of a table session changed (placed, accepted, rejected, cancelled,
// items added/removed/advanced, completed), bump the session's version and refresh the floor map. Runs
// after the order's own commit, so a poll landing in the few milliseconds between may still get one
// last 304 — the next poll sees the change. A failure here never fails the order change.
// Table sync: also announces the session itself when the change opened it or ended it (an order that opened
// the table, a cancel that auto-released it); the guests' poll sees every change through the version bump.
export async function tableOrderChanged(tableSessionId: string | null | undefined, options: { sessionOpened?: boolean } = {}): Promise<void> {
  if (!tableSessionId) {
    return;
  }
  try {
    const session = await prisma.tableSession.update({
      where: { id: tableSessionId },
      data: { version: { increment: 1 } },
      select: { diningAreaId: true, status: true },
    });
    if (options.sessionOpened || session.status !== TableSessionStatus.OPEN) {
      await emitSessionUpdated(tableSessionId);
    }
    await emitTableUpdated(session.diningAreaId);
    // An order change can cancel the bill's split (tableBillGuard.syncTableBill): tell the bill's watchers.
    await emitTableBillUpdated(tableSessionId);
  } catch (error) {
    console.error("[table] could not record an order change on its table session", error);
  }
}
