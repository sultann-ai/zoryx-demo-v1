import {
  OrderEventType,
  OrderItemStatus,
  OrderStatus,
  OrderType,
  Prisma,
  StaffRole,
  TableBillStatus,
  TableSessionEventType,
  TableSessionOpenedVia,
  TableSessionStatus,
  TableShareStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { getIO } from "../../config/socket";
import { recordOrderEvent } from "../order/orderEvents";
import { getSiteSettings } from "../siteContent/siteContent.service";
import { generateJoinPin } from "../tableGuest/guestToken";
import { uniqueDisplayName } from "../tableGuest/tableGuest.service";
import { syncTableBill } from "./tableBillGuard";
import { TableStaffError } from "./tableErrors";
import { emitSessionUpdated, emitTableBillUpdated, emitTablesUpdated, FLOOR_ROOMS, SHARE_STATUSES_WITH_MONEY, tableOrderChanged } from "./tableNotify";
import { ensureOpenSession, insertOpenSession, lockSession, lockSessions, lockTables, releaseIfIdle } from "./tableOccupancy";

// Table sync R7 (docs/TABLE_SYNC_SPEC.md): the only ways an order or a party changes table. Every one runs in
// one transaction with the R10 lock order (tables by id, then sessions by id, then orders, then bills), keeps
// guests' tokens working (a token belongs to its guest row, and the guest row moves with the party), and
// emits order:table-changed to the kitchens plus table:updated for every table it touched.

type Tx = Prisma.TransactionClient;
type Actor = { id: string; role: StaffRole };

const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  new TableStaffError(status, code, message, extra);

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.AWAITING_RECEPTION,
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
];

const sessionNotFound = () => fail(404, "NOT_FOUND", "Table session not found");
const sessionNotOpen = () => fail(409, "SESSION_NOT_OPEN", "This table session is no longer open");
const sessionIsMerged = (tableName: string) =>
  fail(409, "SESSION_IS_MERGED", `${tableName} is joined to another table. Open that table, or unmerge first.`);

function emitSafely(emit: () => void): void {
  try {
    emit();
  } catch {
    // No Socket.io in this process — nothing to notify.
  }
}

interface MovedOrder {
  id: string;
  orderNumber: number;
  placedByStaffId: string | null;
  items: { id: string; kitchenId: string; status: OrderItemStatus }[];
}

// "order:table-changed": the kitchens holding unserved items of the order patch their cards; lists refetch.
function emitOrderTableChanged(order: MovedOrder, to: { id: string; name: string; area: string | null }, from: { id: string; name: string }) {
  const payload = { orderId: order.id, orderNumber: order.orderNumber, diningArea: to, fromDiningArea: from };
  emitSafely(() => {
    const io = getIO();
    const kitchens = new Set(order.items.filter((item) => item.status !== OrderItemStatus.SERVED).map((item) => item.kitchenId));
    for (const kitchenId of kitchens) {
      io.to(`kitchen:${kitchenId}`).emit("order:table-changed", payload);
    }
    for (const room of FLOOR_ROOMS) {
      io.to(room).emit("order:table-changed", payload);
    }
    if (order.placedByStaffId) {
      io.to(`user:${order.placedByStaffId}`).emit("order:table-changed", payload);
    }
    io.to("pos-admin").emit("order:updated", { orderId: order.id, orderNumber: order.orderNumber });
  });
}

const movedOrderSelect = {
  id: true,
  orderNumber: true,
  placedByStaffId: true,
  items: { select: { id: true, kitchenId: true, status: true } },
} satisfies Prisma.OrderSelect;

async function tableRow(tx: Tx, id: string) {
  const table = await tx.diningArea.findUnique({ where: { id }, select: { id: true, name: true, area: true, isActive: true, outOfService: true } });
  if (!table) {
    throw fail(404, "NOT_FOUND", "Table not found");
  }
  return table;
}

function assertAvailable(table: { name: string; isActive: boolean; outOfService: boolean }) {
  if (!table.isActive || table.outOfService) {
    throw fail(409, "TABLE_UNAVAILABLE", `${table.name} is out of service.`);
  }
}

/** A session's bill with money on a live share blocks anything that changes who pays what. */
async function assertNoMoney(tx: Tx, sessionId: string, tableName: string) {
  const bill = await tx.tableBill.findUnique({
    where: { sessionId },
    select: { status: true, splitVersion: true, shares: { select: { status: true, splitVersion: true } } },
  });
  if (!bill) {
    return;
  }
  const money =
    bill.status === TableBillStatus.PAID ||
    bill.shares.some((share) => share.splitVersion === bill.splitVersion && SHARE_STATUSES_WITH_MONEY.includes(share.status));
  if (money) {
    throw fail(
      409,
      "SPLIT_HAS_PAYMENTS",
      `${tableName}'s bill already has payments on its shares. Check or unmark them before changing the bill.`,
    );
  }
}

async function sessionEvent(tx: Tx, sessionId: string, type: TableSessionEventType, actorId: string, after: Prisma.InputJsonValue, reason?: string) {
  await tx.tableSessionEvent.create({ data: { sessionId, type, actorId, after, ...(reason ? { reason } : {}) } });
}

async function tableChangedEvent(tx: Tx, orderId: string, actorId: string, from: string, to: string) {
  await recordOrderEvent(tx, { orderId, actorId, type: OrderEventType.TABLE_CHANGED, before: { table: from }, after: { table: to } });
}

// ================= Move one order =================

export interface MoveOrderInput {
  diningAreaId: string;
  expectedTableSessionId: string | null;
}

/** POST /orders/:id/move-table (SA, PA): one order to another table's session (opened if free). */
export async function moveOrderToTable(orderId: string, input: MoveOrderInput, actor: Actor) {
  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        ...movedOrderSelect,
        type: true,
        status: true,
        businessDayId: true,
        diningAreaId: true,
        tableSessionId: true,
        tableGuestId: true,
        diningArea: { select: { id: true, name: true } },
      },
    });
    if (!order) {
      throw fail(404, "NOT_FOUND", "Order not found");
    }
    if (order.type !== OrderType.DINE_IN || order.diningAreaId === null) {
      throw fail(409, "NOT_DINE_IN", "Only dine-in orders sit at a table.");
    }
    if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.CANCELLED) {
      throw fail(409, "ORDER_NOT_MOVABLE", "Finished or cancelled orders can't change table.");
    }
    if (order.diningAreaId === input.diningAreaId) {
      throw fail(400, "SAME_TABLE", `The order is already at ${order.diningArea?.name ?? "that table"}.`);
    }
    if (order.tableGuestId !== null) {
      throw fail(409, "GUEST_ROUND_NOT_MOVABLE", "This round belongs to a guest at the table. Move the whole party, or split the table.");
    }
    await lockTables(tx, [order.diningAreaId, input.diningAreaId]);
    const target = await tableRow(tx, input.diningAreaId);
    const from = { id: order.diningAreaId, name: order.diningArea?.name ?? "" };

    // On hold: no session yet, just the table it will take at release.
    if (order.status === OrderStatus.SCHEDULED) {
      assertAvailable(target);
      await tx.order.update({ where: { id: orderId }, data: { diningAreaId: target.id } });
      await tableChangedEvent(tx, orderId, actor.id, from.name, target.name);
      return { order, target, from, source: null, sessionId: null, opened: false, pin: null, released: null };
    }

    const source = order.tableSessionId;
    if (source) {
      await lockSession(tx, source);
      const sourceTable = await tx.tableSession.findUniqueOrThrow({ where: { id: source }, select: { diningArea: { select: { name: true } } } });
      await assertNoMoney(tx, source, sourceTable.diningArea.name);
    }
    const ensured = await ensureOpenSession(tx, {
      diningAreaId: target.id,
      expectedTableSessionId: input.expectedTableSessionId,
      businessDayId: order.businessDayId,
      opener: { staffId: actor.id, role: actor.role },
      via: TableSessionOpenedVia.STAFF_ORDER,
    });
    if (ensured.sessionId !== source) {
      await assertNoMoney(tx, ensured.sessionId, target.name);
    }
    await tx.order.update({ where: { id: orderId }, data: { diningAreaId: target.id, tableSessionId: ensured.sessionId } });
    if (ensured.opened) {
      await tx.tableSession.update({ where: { id: ensured.sessionId }, data: { openedByOrderId: orderId } });
    }
    await tableChangedEvent(tx, orderId, actor.id, from.name, target.name);
    let released: string | null = null;
    if (source && source !== ensured.sessionId) {
      await sessionEvent(tx, source, TableSessionEventType.ORDER_MOVED_OUT, actor.id, { orderId, orderNumber: order.orderNumber, to: target.name });
      await sessionEvent(tx, ensured.sessionId, TableSessionEventType.ORDER_MOVED_IN, actor.id, { orderId, orderNumber: order.orderNumber, from: from.name });
      await syncTableBill(tx, source, actor.id);
      released = await releaseIfIdle(tx, source, actor.id);
    } else if (!source) {
      await sessionEvent(tx, ensured.sessionId, TableSessionEventType.ORDER_MOVED_IN, actor.id, { orderId, orderNumber: order.orderNumber, from: from.name });
    }
    await syncTableBill(tx, ensured.sessionId, actor.id);
    return { order, target, from, source, sessionId: ensured.sessionId, opened: ensured.opened, pin: ensured.pin, released };
  });

  emitOrderTableChanged(outcome.order, { id: outcome.target.id, name: outcome.target.name, area: outcome.target.area }, outcome.from);
  if (outcome.source && outcome.source !== outcome.sessionId) {
    await tableOrderChanged(outcome.source);
    await emitTableBillUpdated(outcome.source);
  }
  if (outcome.sessionId) {
    await tableOrderChanged(outcome.sessionId, { sessionOpened: outcome.opened });
  } else {
    await emitTablesUpdated([outcome.from.id, outcome.target.id]);
  }
  return {
    orderId,
    diningAreaId: outcome.target.id,
    tableSessionId: outcome.sessionId,
    tableOpened: outcome.opened && outcome.sessionId ? { sessionId: outcome.sessionId, pin: outcome.pin } : null,
  };
}

// ================= Move the party =================

/** POST /table-sessions/:id/move (SA, PA, OT): the whole session to a free table. Guests keep their tokens. */
export async function moveSession(sessionId: string, diningAreaId: string, actor: Actor) {
  const outcome = await prisma.$transaction(async (tx) => {
    const session = await tx.tableSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, diningAreaId: true, mergedIntoSessionId: true, diningArea: { select: { id: true, name: true } } },
    });
    if (!session) {
      throw sessionNotFound();
    }
    if (session.diningAreaId === diningAreaId) {
      throw fail(400, "SAME_TABLE", `The party is already at ${session.diningArea.name}.`);
    }
    await lockTables(tx, [session.diningAreaId, diningAreaId]);
    await lockSession(tx, sessionId);
    const current = await tx.tableSession.findUniqueOrThrow({ where: { id: sessionId }, select: { status: true, mergedIntoSessionId: true } });
    if (current.status !== TableSessionStatus.OPEN) {
      throw sessionNotOpen();
    }
    if (current.mergedIntoSessionId) {
      throw sessionIsMerged(session.diningArea.name);
    }
    const target = await tableRow(tx, diningAreaId);
    assertAvailable(target);
    const taken = await tx.tableSession.findFirst({ where: { diningAreaId, status: TableSessionStatus.OPEN }, select: { id: true, mergedIntoSessionId: true } });
    if (taken) {
      throw fail(409, "TARGET_OCCUPIED", `${target.name} is taken. Merge the two tables instead?`, {
        sessionId: taken.mergedIntoSessionId ?? taken.id,
      });
    }
    await tx.tableSession.update({ where: { id: sessionId }, data: { diningAreaId, version: { increment: 1 } } });
    const orders = await tx.order.findMany({
      where: { tableSessionId: sessionId, diningAreaId: session.diningAreaId, status: { in: [...OPEN_ORDER_STATUSES, OrderStatus.SCHEDULED] } },
      select: movedOrderSelect,
    });
    if (orders.length > 0) {
      await tx.order.updateMany({ where: { id: { in: orders.map((order) => order.id) } }, data: { diningAreaId } });
      for (const order of orders) {
        await tableChangedEvent(tx, order.id, actor.id, session.diningArea.name, target.name);
      }
    }
    await tx.tableCall.updateMany({ where: { sessionId, diningAreaId: session.diningAreaId }, data: { diningAreaId } });
    await sessionEvent(tx, sessionId, TableSessionEventType.TABLE_MOVED, actor.id, {
      fromTableId: session.diningAreaId,
      fromTableName: session.diningArea.name,
      toTableId: target.id,
      toTableName: target.name,
    });
    return { orders, from: session.diningArea, target };
  });

  for (const order of outcome.orders) {
    emitOrderTableChanged(order, { id: outcome.target.id, name: outcome.target.name, area: outcome.target.area }, outcome.from);
  }
  await emitSessionUpdated(sessionId);
  await emitTablesUpdated([outcome.from.id, outcome.target.id]);
  return { sessionId, diningAreaId: outcome.target.id, movedOrders: outcome.orders.length };
}

// ================= Merge / unmerge =================

/**
 * POST /table-sessions/:id/merge { intoSessionId } (SA, PA, OT): the source party joins the target's session
 * and bill. Orders keep their own table; guests move (tokens keep working) and get join orders after the
 * target's; the source row stays OPEN with mergedIntoSessionId so its table stays taken.
 */
export async function mergeSession(sourceId: string, intoSessionId: string, actor: Actor) {
  if (sourceId === intoSessionId) {
    throw fail(400, "SAME_TABLE", "Pick another table to merge with.");
  }
  const outcome = await prisma.$transaction(async (tx) => {
    const both = await tx.tableSession.findMany({
      where: { id: { in: [sourceId, intoSessionId] } },
      select: { id: true, diningAreaId: true },
    });
    if (both.length !== 2) {
      throw sessionNotFound();
    }
    await lockTables(tx, both.map((session) => session.diningAreaId));
    await lockSessions(tx, [sourceId, intoSessionId]);
    const sessions = await tx.tableSession.findMany({
      where: { id: { in: [sourceId, intoSessionId] } },
      select: { id: true, status: true, businessDayId: true, mergedIntoSessionId: true, diningAreaId: true, diningArea: { select: { name: true } } },
    });
    const source = sessions.find((session) => session.id === sourceId)!;
    const target = sessions.find((session) => session.id === intoSessionId)!;
    for (const session of [source, target]) {
      if (session.status !== TableSessionStatus.OPEN) {
        throw sessionNotOpen();
      }
      if (session.mergedIntoSessionId) {
        throw sessionIsMerged(session.diningArea.name);
      }
    }
    if (source.businessDayId !== target.businessDayId) {
      throw fail(409, "MERGE_DIFFERENT_DAY", "These tables were opened on different business days.");
    }
    await assertNoMoney(tx, source.id, source.diningArea.name);
    await assertNoMoney(tx, target.id, target.diningArea.name);

    await tx.order.updateMany({ where: { tableSessionId: source.id }, data: { tableSessionId: target.id } });
    const [movingGuests, targetGuests] = await Promise.all([
      tx.tableGuest.findMany({ where: { sessionId: source.id }, select: { id: true, displayName: true, revokedAt: true }, orderBy: { joinOrder: "asc" } }),
      tx.tableGuest.findMany({ where: { sessionId: target.id }, select: { displayName: true, joinOrder: true, revokedAt: true } }),
    ]);
    let joinOrder = targetGuests.reduce((max, guest) => Math.max(max, guest.joinOrder), 0);
    const takenNames = targetGuests.filter((guest) => guest.revokedAt === null).map((guest) => guest.displayName);
    for (const guest of movingGuests) {
      joinOrder += 1;
      const displayName = guest.revokedAt === null ? uniqueDisplayName(guest.displayName, takenNames) : guest.displayName;
      if (guest.revokedAt === null) {
        takenNames.push(displayName);
      }
      await tx.tableGuest.update({ where: { id: guest.id }, data: { sessionId: target.id, joinOrder, displayName } });
    }
    await tx.tableCall.updateMany({ where: { sessionId: source.id }, data: { sessionId: target.id } });
    // The source's own bill (if any) had no money (checked above): it stops counting.
    const sourceBill = await tx.tableBill.findUnique({ where: { sessionId: source.id }, select: { id: true, splitVersion: true } });
    if (sourceBill) {
      await tx.tableBillShare.updateMany({
        where: { billId: sourceBill.id, status: { not: TableShareStatus.VOID } },
        data: { status: TableShareStatus.VOID },
      });
      await tx.tableBill.update({
        where: { id: sourceBill.id },
        data: { status: TableBillStatus.UNLOCKED, splitMode: null, splitVersion: { increment: 1 }, version: { increment: 1 } },
      });
    }
    // Tables already merged into the source follow it into the target.
    await tx.tableSession.updateMany({ where: { mergedIntoSessionId: source.id, status: TableSessionStatus.OPEN }, data: { mergedIntoSessionId: target.id } });
    await tx.tableSession.update({ where: { id: source.id }, data: { mergedIntoSessionId: target.id, version: { increment: 1 } } });
    await tx.tableSession.update({ where: { id: target.id }, data: { version: { increment: 1 } } });
    await sessionEvent(tx, source.id, TableSessionEventType.MERGED, actor.id, { intoSessionId: target.id, intoTable: target.diningArea.name });
    await sessionEvent(tx, target.id, TableSessionEventType.MERGED, actor.id, {
      fromSessionId: source.id,
      fromTable: source.diningArea.name,
      guests: movingGuests.length,
    });
    await syncTableBill(tx, target.id, actor.id);
    return { source, target };
  });

  await emitSessionUpdated(outcome.source.id);
  await emitSessionUpdated(outcome.target.id);
  await tableOrderChanged(outcome.target.id);
  await emitTablesUpdated([outcome.source.diningAreaId, outcome.target.diningAreaId]);
  return { sessionId: outcome.target.id, mergedSessionId: outcome.source.id };
}

/**
 * POST /table-sessions/:id/unmerge (the merged-in session; SA, PA, OT): the party gives that table back. Its
 * session is voided ("Unmerged"), the table is free again, and every order stays on the parent's bill.
 */
export async function unmergeSession(childId: string, actor: Actor) {
  const outcome = await prisma.$transaction(async (tx) => {
    const child = await tx.tableSession.findUnique({ where: { id: childId }, select: { id: true, diningAreaId: true, mergedIntoSessionId: true } });
    if (!child) {
      throw sessionNotFound();
    }
    if (!child.mergedIntoSessionId) {
      throw fail(409, "NOT_MERGED", "This table isn't joined to another table.");
    }
    await lockTables(tx, [child.diningAreaId]);
    await lockSessions(tx, [child.id, child.mergedIntoSessionId]);
    const voided = await tx.tableSession.updateMany({
      where: { id: child.id, status: TableSessionStatus.OPEN },
      data: { status: TableSessionStatus.VOIDED, voidReason: "Unmerged", closedAt: new Date(), closedById: actor.id, version: { increment: 1 } },
    });
    if (voided.count === 0) {
      throw sessionNotOpen();
    }
    const parent = await tx.tableSession.update({
      where: { id: child.mergedIntoSessionId },
      data: { version: { increment: 1 } },
      select: { id: true, diningAreaId: true },
    });
    await sessionEvent(tx, child.id, TableSessionEventType.UNMERGED, actor.id, { fromSessionId: parent.id });
    await sessionEvent(tx, parent.id, TableSessionEventType.UNMERGED, actor.id, { tableId: child.diningAreaId });
    return { child, parent };
  });
  await emitSessionUpdated(outcome.child.id);
  await emitSessionUpdated(outcome.parent.id);
  await emitTablesUpdated([outcome.child.diningAreaId, outcome.parent.diningAreaId]);
  return { sessionId: outcome.child.id, status: TableSessionStatus.VOIDED };
}

// ================= Split off =================

export interface SplitOffInput {
  diningAreaId: string;
  orderIds: string[];
  guestIds: string[];
}

/**
 * POST /table-sessions/:id/split-off (SA, PA): part of the party moves to a free table with its own session and
 * bill. A guest moves with every one of their rounds, and a round only with its guest.
 */
export async function splitOffSession(sessionId: string, input: SplitOffInput, actor: Actor) {
  if (input.orderIds.length === 0 && input.guestIds.length === 0) {
    throw fail(400, "BAD_REQUEST", "Choose the orders or guests that move.");
  }
  const outcome = await prisma.$transaction(async (tx) => {
    const session = await tx.tableSession.findUnique({
      where: { id: sessionId },
      select: { id: true, diningAreaId: true, businessDayId: true, waiterStaffId: true, diningArea: { select: { id: true, name: true } } },
    });
    if (!session) {
      throw sessionNotFound();
    }
    if (session.diningAreaId === input.diningAreaId) {
      throw fail(400, "SAME_TABLE", `The party is already at ${session.diningArea.name}.`);
    }
    await lockTables(tx, [session.diningAreaId, input.diningAreaId]);
    await lockSession(tx, sessionId);
    const current = await tx.tableSession.findUniqueOrThrow({ where: { id: sessionId }, select: { status: true, mergedIntoSessionId: true } });
    if (current.status !== TableSessionStatus.OPEN) {
      throw sessionNotOpen();
    }
    if (current.mergedIntoSessionId) {
      throw sessionIsMerged(session.diningArea.name);
    }
    const target = await tableRow(tx, input.diningAreaId);
    assertAvailable(target);
    const taken = await tx.tableSession.findFirst({ where: { diningAreaId: target.id, status: TableSessionStatus.OPEN }, select: { id: true, mergedIntoSessionId: true } });
    if (taken) {
      throw fail(409, "TARGET_OCCUPIED", `${target.name} is taken. Merge the two tables instead?`, { sessionId: taken.mergedIntoSessionId ?? taken.id });
    }
    await assertNoMoney(tx, sessionId, session.diningArea.name);

    const orders = await tx.order.findMany({
      where: { id: { in: input.orderIds }, tableSessionId: sessionId, status: { not: OrderStatus.CANCELLED } },
      select: { ...movedOrderSelect, tableGuestId: true, status: true },
    });
    if (orders.length !== new Set(input.orderIds).size) {
      throw fail(400, "BAD_REQUEST", "Some of those orders aren't open orders of this table.");
    }
    if (orders.some((order) => order.status === OrderStatus.COMPLETED)) {
      throw fail(409, "ORDER_NOT_MOVABLE", "Finished or cancelled orders can't change table.");
    }
    const guests = await tx.tableGuest.findMany({ where: { id: { in: input.guestIds }, sessionId }, select: { id: true }, orderBy: { joinOrder: "asc" } });
    if (guests.length !== new Set(input.guestIds).size) {
      throw fail(400, "BAD_REQUEST", "Some of those guests aren't at this table.");
    }
    const movingGuests = new Set(guests.map((guest) => guest.id));
    const movingOrders = new Set(orders.map((order) => order.id));
    const guestRounds = await tx.order.findMany({
      where: { tableSessionId: sessionId, tableGuestId: { in: [...movingGuests] }, status: { not: OrderStatus.CANCELLED } },
      select: { id: true },
    });
    if (
      orders.some((order) => order.tableGuestId !== null && !movingGuests.has(order.tableGuestId)) ||
      guestRounds.some((round) => !movingOrders.has(round.id))
    ) {
      throw fail(400, "GUEST_ROUNDS_MUST_MOVE_TOGETHER", "A guest moves with all of their rounds.");
    }

    const settings = await getSiteSettings();
    const newId = await insertOpenSession(tx, {
      diningAreaId: target.id,
      businessDayId: session.businessDayId,
      seatedById: actor.id,
      waiterStaffId: session.waiterStaffId,
      joinPin: settings.tableQrRequirePin ? generateJoinPin() : null,
      via: TableSessionOpenedVia.SPLIT_OFF,
    });
    if (!newId) {
      throw fail(409, "TARGET_OCCUPIED", `${target.name} is taken. Merge the two tables instead?`);
    }
    if (orders.length > 0) {
      await tx.order.updateMany({ where: { id: { in: [...movingOrders] } }, data: { tableSessionId: newId, diningAreaId: target.id } });
      for (const order of orders) {
        await tableChangedEvent(tx, order.id, actor.id, session.diningArea.name, target.name);
      }
    }
    let joinOrder = 0;
    for (const guest of guests) {
      joinOrder += 1;
      await tx.tableGuest.update({ where: { id: guest.id }, data: { sessionId: newId, joinOrder } });
    }
    if (movingGuests.size > 0) {
      await tx.tableCall.updateMany({ where: { sessionId, guestId: { in: [...movingGuests] } }, data: { sessionId: newId, diningAreaId: target.id } });
    }
    await sessionEvent(tx, sessionId, TableSessionEventType.SPLIT_OFF, actor.id, { toSessionId: newId, toTable: target.name, orders: orders.length, guests: guests.length });
    await sessionEvent(tx, newId, TableSessionEventType.SPLIT_OFF, actor.id, { fromSessionId: sessionId, fromTable: session.diningArea.name });
    await tx.tableSession.update({ where: { id: sessionId }, data: { version: { increment: 1 } } });
    await syncTableBill(tx, sessionId, actor.id);
    const released = await releaseIfIdle(tx, sessionId, actor.id);
    return { orders, from: session.diningArea, target, newId, released };
  });

  for (const order of outcome.orders) {
    emitOrderTableChanged(order, { id: outcome.target.id, name: outcome.target.name, area: outcome.target.area }, outcome.from);
  }
  await emitSessionUpdated(sessionId);
  await emitSessionUpdated(outcome.newId);
  await tableOrderChanged(sessionId);
  await emitTableBillUpdated(sessionId);
  await emitTablesUpdated([outcome.from.id, outcome.target.id]);
  return { sessionId: outcome.newId, fromSessionId: sessionId };
}
