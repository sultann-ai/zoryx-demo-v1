import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  TableBillStatus,
  TableSessionEventType,
  TableShareStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { TableStaffError } from "./tableErrors";
import { SHARE_STATUSES_WITH_MONEY, touchTableSession } from "./tableNotify";

// The table bill's footprint inside the order module (docs/TABLE_QR_SPEC.md §7.1, §7.3, Conflict C5).
// order.service calls these from inside its own transactions; this file imports nothing from
// order.service (or the bill service), so there's no import cycle.

type Db = Prisma.TransactionClient | typeof prisma;
const ZERO = new Prisma.Decimal(0);

/** Billable = the session's orders not cancelled and not already paid one by one (spec §7.1). */
export const billableOrderWhere = (sessionId: string): Prisma.OrderWhereInput => ({
  tableSessionId: sessionId,
  status: { not: OrderStatus.CANCELLED },
  paymentStatus: { not: PaymentStatus.VERIFIED },
});

export const billableOrderSelect = {
  id: true,
  orderNumber: true,
  status: true,
  discount: true,
  totalAmount: true,
  tableGuestId: true,
  items: { select: { id: true, subtotal: true, dealOrderLineId: true, tableGuestId: true } },
  dealLines: { select: { id: true, subtotal: true, tableGuestId: true } },
} satisfies Prisma.OrderSelect;

export type BillableOrder = Prisma.OrderGetPayload<{ select: typeof billableOrderSelect }>;

/** An order's items + deal lines, before any discount (a deal's exploded items are priced on the deal line). */
export function orderSubtotal(order: Pick<BillableOrder, "items" | "dealLines">): Prisma.Decimal {
  const items = order.items.filter((item) => item.dealOrderLineId === null).reduce((sum, item) => sum.plus(item.subtotal), ZERO);
  return order.dealLines.reduce((sum, line) => sum.plus(line.subtotal), items);
}

export interface BillTotals {
  orders: BillableOrder[];
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  total: Prisma.Decimal;
  /** Some billable order still waits at reception: no split, discount or settling until it's reviewed. */
  awaiting: boolean;
}

/** Recomputes the bill from its orders, the source of truth (spec §7.2). */
export async function computeBillTotals(db: Db, sessionId: string): Promise<BillTotals> {
  const orders = await db.order.findMany({ where: billableOrderWhere(sessionId), select: billableOrderSelect, orderBy: { orderNumber: "asc" } });
  return {
    orders,
    subtotal: orders.reduce((sum, order) => sum.plus(orderSubtotal(order)), ZERO),
    discount: orders.reduce((sum, order) => sum.plus(order.discount), ZERO),
    total: orders.reduce((sum, order) => sum.plus(order.totalAmount), ZERO),
    awaiting: orders.some((order) => order.status === OrderStatus.AWAITING_RECEPTION),
  };
}

export const splitHasPayments = () =>
  new TableStaffError(
    409,
    "SPLIT_HAS_PAYMENTS",
    "This table's bill already has payments on its shares. Unmark or reject them before changing the bill.",
  );

/**
 * After an order of a table changed (items added/removed, cancelled, accepted, edited at reception), inside
 * that change's transaction: refresh the bill's snapshot, and if the total moved, cancel the split — its
 * shares go VOID (the guests split again) — or refuse the whole change with SPLIT_HAS_PAYMENTS when a share
 * already has money on it (spec §7.3). Returns whether the bill changed. A no-op for a table with no bill.
 */
export async function syncTableBill(tx: Prisma.TransactionClient, sessionId: string, actorId: string | null): Promise<boolean> {
  // Same lock order as every bill write: the bill row first, then its shares.
  const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "TableBill" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
  if (locked.length === 0) {
    return false;
  }
  const bill = await tx.tableBill.findUniqueOrThrow({
    where: { sessionId },
    select: { id: true, subtotal: true, discount: true, total: true, splitVersion: true, splitMode: true },
  });
  const totals = await computeBillTotals(tx, sessionId);
  if (totals.total.equals(bill.total) && totals.subtotal.equals(bill.subtotal) && totals.discount.equals(bill.discount)) {
    return false;
  }
  const live = await tx.tableBillShare.findMany({
    where: { billId: bill.id, splitVersion: bill.splitVersion, status: { not: TableShareStatus.VOID } },
    select: { id: true, status: true },
  });
  if (live.some((share) => SHARE_STATUSES_WITH_MONEY.includes(share.status))) {
    throw splitHasPayments();
  }
  const cancelSplit = live.length > 0;
  if (cancelSplit) {
    await tx.tableBillShare.updateMany({ where: { id: { in: live.map((share) => share.id) } }, data: { status: TableShareStatus.VOID } });
  }
  await tx.tableBill.update({
    where: { id: bill.id },
    data: {
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      version: { increment: 1 },
      ...(cancelSplit ? { splitVersion: { increment: 1 } } : {}),
    },
  });
  if (cancelSplit) {
    await tx.tableSessionEvent.create({
      data: {
        sessionId,
        type: TableSessionEventType.SPLIT_CANCELLED,
        actorId,
        reason: "The bill changed",
        before: { total: bill.total.toFixed(2), splitMode: bill.splitMode },
        after: { total: totals.total.toFixed(2) },
      },
    });
  }
  await touchTableSession(tx, sessionId);
  return true;
}

/** syncTableBill for the session an order belongs to (nothing for an order not from a table). */
export async function syncTableBillForOrder(tx: Prisma.TransactionClient, orderId: string, actorId: string | null): Promise<boolean> {
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { tableSessionId: true } });
  return order?.tableSessionId ? syncTableBill(tx, order.tableSessionId, actorId) : false;
}

/**
 * Phase 2 (Conflict C5): once a table has a bill being paid, its orders are paid and completed through
 * that bill only — the one-by-one payment-status / complete / delivered actions answer 409 USE_TABLE_BILL.
 */
export async function assertNotPaidThroughTableBill(db: Db, orderId: string): Promise<void> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { tableSession: { select: { bill: { select: { status: true } } } } },
  });
  const status = order?.tableSession?.bill?.status;
  if (status === TableBillStatus.REQUESTED || status === TableBillStatus.PAID) {
    throw new TableStaffError(409, "USE_TABLE_BILL", "This order is paid through its table's bill. Open the table to take payment.");
  }
}

/** A requested (or paid) bill locks the table: no new guest rounds until staff unlock it (BILL_LOCKED). */
export async function isBillLocked(db: Db, sessionId: string): Promise<boolean> {
  const bill = await db.tableBill.findUnique({ where: { sessionId }, select: { status: true } });
  return bill?.status === TableBillStatus.REQUESTED || bill?.status === TableBillStatus.PAID;
}
