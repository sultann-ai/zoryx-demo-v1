import type { TableSessionDetail, TableSessionOrder } from "../../api/tables";
import { formatMoney } from "../../lib/format";

// Pure rules the table side sheet reads (table sync R3, R5): how an order's source is labelled, what keeps a
// table from closing (mirroring the server's close rules), and what Settle would take.

/** Where an order at a table came from: the POS counter, a waiter's phone, or a guest's QR round. */
export function orderSourceLabel(order: Pick<TableSessionOrder, "source" | "tableGuest">): string {
  switch (order.source) {
    case "TABLE_QR":
      return `QR · ${order.tableGuest?.displayName ?? "guest"}`;
    case "ORDER_TAKER":
      return "Waiter";
    case "POS":
      return "POS";
    case "PHONE":
      return "Phone";
    default:
      return "Online";
  }
}

const OPEN_STATUSES = new Set(["PENDING", "CONFIRMED", "IN_KITCHEN", "READY"]);

interface Blocker {
  key: string;
  text: string;
  orderId?: string;
  toIncoming?: boolean;
}

/** Everything that keeps a table from closing, in words (mirrors the server's close rules, R5). */
export function closeBlockers(detail: TableSessionDetail): Blocker[] {
  const blockers: Blocker[] = [];
  for (const order of detail.orders) {
    if (order.status === "AWAITING_RECEPTION") {
      blockers.push({ key: order.id, orderId: order.id, toIncoming: true, text: `#${order.orderNumber} (${orderSourceLabel(order)}) is waiting at reception — accept or reject it.` });
    }
  }
  const bill = detail.bill;
  if (bill?.status === "REQUESTED") {
    const paid = bill.shares.filter((share) => share.status === "VERIFIED").length;
    blockers.push({
      key: "bill",
      text: bill.shares.length > 0 ? `The bill is being paid: ${paid} of ${bill.shares.length} shares paid.` : "The bill was requested and isn't paid yet.",
    });
    return blockers;
  }
  if (bill?.status === "PAID") {
    return blockers;
  }
  const unpaid = detail.orders.filter((order) => order.status !== "CANCELLED" && order.status !== "AWAITING_RECEPTION" && order.paymentStatus !== "VERIFIED");
  if (unpaid.length > 0) {
    const owed = unpaid.reduce((sum, order) => sum + Number(order.totalAmount), 0);
    const stillCooking = unpaid.filter((order) => OPEN_STATUSES.has(order.status)).length;
    blockers.push({
      key: "unpaid",
      text: `${unpaid.length} ${unpaid.length === 1 ? "order isn't" : "orders aren't"} paid yet (${formatMoney(owed)})${
        stillCooking > 0 ? `, ${stillCooking} still open in the kitchen` : ""
      } — settle the table to take the money and close it.`,
    });
  }
  return blockers;
}

/** What Settle takes: every order not cancelled and not already paid. */
export function amountOwed(detail: TableSessionDetail): number {
  return detail.orders
    .filter((order) => order.status !== "CANCELLED" && order.paymentStatus !== "VERIFIED")
    .reduce((sum, order) => sum + Number(order.totalAmount), 0);
}

