// The floor map's state for one table (docs/TABLE_QR_SPEC.md §3.7). Pure: every input is read by
// the caller, so this is unit-testable and the same answer goes to GET /tables/floor and to every
// "table:updated" emit. The first matching row wins.

export type TableState =
  | "UNAVAILABLE"
  | "EMPTY"
  | "PAYING"
  | "BILL_REQUESTED"
  | "ORDER_AWAITING"
  | "IN_KITCHEN"
  | "SERVED"
  | "SEATED";

export type TableAttention = null | "OPEN" | "ESCALATED";

export interface TableStateInput {
  outOfService: boolean;
  hasOpenSession: boolean;
  // Phase 2 (bill). Zero / false until the bill exists.
  billRequested: boolean;
  sharesPaidOrSubmitted: number;
  // Build step 3 (waiter calls). False / zero until calls exist.
  openBillCashCall: boolean;
  openCalls: number;
  escalatedCalls: number;
  // Orders of the open session.
  awaitingOrders: number;
  // Items of accepted, non-cancelled orders still PENDING / PREPARING / READY.
  kitchenItems: number;
  readyItems: number;
  // Accepted, non-cancelled orders (any status other than AWAITING_RECEPTION / CANCELLED).
  acceptedOrders: number;
}

export interface DerivedTableState {
  state: TableState;
  attention: TableAttention;
  readyCount: number;
}

export function deriveTableState(input: TableStateInput): DerivedTableState {
  const attention: TableAttention =
    input.hasOpenSession && input.openCalls > 0 ? (input.escalatedCalls > 0 ? "ESCALATED" : "OPEN") : null;
  const result = (state: TableState): DerivedTableState => ({
    state,
    attention: state === "UNAVAILABLE" || state === "EMPTY" ? null : attention,
    readyCount: input.readyItems,
  });

  if (input.outOfService) {
    return result("UNAVAILABLE");
  }
  if (!input.hasOpenSession) {
    return result("EMPTY");
  }
  if (input.billRequested && input.sharesPaidOrSubmitted > 0) {
    return result("PAYING");
  }
  if (input.billRequested || input.openBillCashCall) {
    return result("BILL_REQUESTED");
  }
  if (input.awaitingOrders > 0) {
    return result("ORDER_AWAITING");
  }
  if (input.kitchenItems > 0) {
    return result("IN_KITCHEN");
  }
  if (input.acceptedOrders > 0) {
    return result("SERVED");
  }
  return result("SEATED");
}
