import { OrderItemStatus, OrderStatus, Prisma, TableCallStatus, TableCallType, TableSessionStatus } from "../../../generated/prisma/client";
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

export async function loadTableState(
  db: Db,
  diningAreaId: string,
): Promise<{ sessionId: string | null } & DerivedTableState> {
  const table = await db.diningArea.findUnique({
    where: { id: diningAreaId },
    select: {
      outOfService: true,
      tableSessions: {
        where: { status: TableSessionStatus.OPEN },
        select: {
          id: true,
          orders: { select: { status: true, items: { select: { status: true } } } },
          calls: { where: { status: { in: OPEN_CALL_STATUSES_FOR_STATE } }, select: { type: true, escalatedAt: true } },
        },
      },
    },
  });
  const session = table?.tableSessions[0] ?? null;
  const derived = deriveTableState({
    outOfService: table?.outOfService ?? false,
    hasOpenSession: session !== null,
    billRequested: false,
    sharesPaidOrSubmitted: 0,
    ...callCounts(session?.calls ?? []),
    ...summariseOrders(session?.orders ?? []),
  });
  return { sessionId: session?.id ?? null, ...derived };
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
export async function emitTableUpdated(diningAreaId: string): Promise<void> {
  try {
    const state = await loadTableState(prisma, diningAreaId);
    emitToFloor("table:updated", { diningAreaId, sessionId: state.sessionId, state: state.state, attention: state.attention });
  } catch (error) {
    console.error("[table] could not emit table:updated", error);
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
export async function tableOrderChanged(tableSessionId: string | null | undefined): Promise<void> {
  if (!tableSessionId) {
    return;
  }
  try {
    const session = await prisma.tableSession.update({
      where: { id: tableSessionId },
      data: { version: { increment: 1 } },
      select: { diningAreaId: true },
    });
    await emitTableUpdated(session.diningAreaId);
  } catch (error) {
    console.error("[table] could not record an order change on its table session", error);
  }
}
