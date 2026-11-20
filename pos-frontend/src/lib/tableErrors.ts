import axios from "axios";
import { getApiErrorBody, getApiErrorStatus } from "../api/errors";
import type { TableSessionSummary } from "../api/tables";
import { formatMoney, formatTime } from "./format";

// Every refusal the table-sync backend can answer (docs/TABLE_SYNC_SPEC.md §4.3), turned into one plain
// sentence. The server's own `error` text is already written for staff, so it wins whenever it's there;
// these are what's shown when it isn't (a proxy error page, an older server), so nothing raw ever reaches
// the screen. Keep in step with the spec's table.
const TABLE_CODE_MESSAGES: Record<string, string> = {
  TABLE_EXPECTATION_REQUIRED: "This screen is out of date. Reload the page and pick the table again.",
  TABLE_OCCUPIED: "That table is already open. Add this order to its bill, or pick another table.",
  TABLE_STATE_CHANGED: "That table changed while you were ordering. Check it and send again.",
  TABLE_FROM_PREVIOUS_DAY: "That table is still open from the previous business day. Settle or close it first.",
  TABLE_UNAVAILABLE: "That table is out of service.",
  TABLE_DECISION_NEEDED: "That table is busy. Add this order to its bill, or choose another table.",
  TABLE_NOT_ALLOWED: "Only dine-in orders can have a table.",
  USE_MOVE_TABLE: "Use Move to table to change an order's table.",
  USE_TABLE_BILL: "This order is paid through its table's bill. Open the table to take payment.",
  SPLIT_HAS_PAYMENTS: "This table's bill already has payments on its shares. Check or unmark them before changing the bill.",
  ORDERS_AWAITING: "An order from this table is still waiting at reception. Accept or reject it first.",
  NOTHING_TO_SETTLE: "There's nothing left to pay at this table.",
  NOTHING_TO_BILL: "There's nothing to pay for at this table yet.",
  PAID_AMOUNT_TOO_LOW: "The cash received is less than the table's total.",
  PROOFS_TO_CHECK: "Some guests uploaded payment proofs. Check them before collecting the rest.",
  NO_SPLIT: "This bill isn't split yet. Use Settle to take the whole amount.",
  NOT_DINE_IN: "Only dine-in orders sit at a table.",
  ORDER_NOT_MOVABLE: "Finished or cancelled orders can't change table.",
  GUEST_ROUND_NOT_MOVABLE: "This round belongs to a guest at the table. Move the whole party instead.",
  SAME_TABLE: "It's already at that table.",
  TARGET_OCCUPIED: "That table is taken. Merge the two tables instead?",
  SESSION_IS_MERGED: "This table is joined to another table. Open that table instead.",
  MERGE_DIFFERENT_DAY: "These tables were opened on different business days.",
  GUEST_ROUNDS_MUST_MOVE_TOGETHER: "A guest moves with all of their rounds.",
  TABLE_IN_USE: "That table has guests. Close or move them first.",
  NOT_YOUR_TABLE: "Only this table's waiter or an admin can do that.",
  SESSION_NOT_OPEN: "This table has already been closed.",
  SESSION_HAS_OPEN_ORDERS: "Some of this table's orders are still open. Complete or cancel them first.",
  SESSION_HAS_UNPAID_ORDERS: "This table still owes money. Settle it to close it.",
  SESSION_HAS_ORDERS: "This table has accepted orders, so it can't be voided. Settle and close it instead.",
  BILL_NOT_PAID: "This table's bill isn't fully paid yet.",
  BILL_CHANGED: "The bill changed meanwhile. Check the new total and try again.",
  BILL_PAID: "This bill is already paid.",
  NOT_MERGED: "This table isn't joined to another table.",
  FORBIDDEN: "An order taker can settle a table in cash only, without a discount.",
  NO_BUSINESS_DAY: "Start the business day first.",
};

/** A refusal from any table action as one sentence a person can act on. */
export function tableErrorMessage(error: unknown, fallback: string): string {
  const body = getApiErrorBody(error);
  if (typeof body?.error === "string" && body.error.trim() !== "") {
    return body.error;
  }
  if (body?.code && TABLE_CODE_MESSAGES[body.code]) {
    return TABLE_CODE_MESSAGES[body.code];
  }
  if (axios.isAxiosError(error) && !error.response) {
    return "Couldn't reach the server. Check the connection and try again.";
  }
  const status = getApiErrorStatus(error);
  if (status === 403) {
    return "You don't have permission to do that.";
  }
  return fallback;
}

export function tableErrorCode(error: unknown): string | undefined {
  return getApiErrorBody(error)?.code;
}

/**
 * A table that turned out to be open when the cashier thought it was free (or changed meanwhile): what the
 * screen needs to ask "Add this order to Table 2's bill?". Null for any other refusal.
 */
export interface TableConflict {
  code: "TABLE_OCCUPIED" | "TABLE_STATE_CHANGED" | "TABLE_DECISION_NEEDED";
  message: string;
  session: TableSessionSummary | null;
}

export function getTableConflict(error: unknown): TableConflict | null {
  const body = getApiErrorBody(error);
  if (body?.code === "TABLE_OCCUPIED" || body?.code === "TABLE_STATE_CHANGED" || body?.code === "TABLE_DECISION_NEEDED") {
    return { code: body.code, message: tableErrorMessage(error, TABLE_CODE_MESSAGES[body.code] ?? ""), session: body.session ?? null };
  }
  return null;
}

/** "Since 7:40 PM · 2 orders · Rs 2,300 · 3 guests" — the open table, as a conflict dialog shows it. */
export function describeSessionSummary(session: TableSessionSummary): string {
  const orders = `${session.orderCount} ${session.orderCount === 1 ? "order" : "orders"}`;
  const guests = session.guestCount > 0 ? ` · ${session.guestCount} ${session.guestCount === 1 ? "guest" : "guests"} on phones` : "";
  return `Since ${formatTime(session.openedAt)} · ${orders} · ${formatMoney(session.total)}${guests}`;
}
