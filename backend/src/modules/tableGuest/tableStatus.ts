import { OrderItemStatus, OrderStatus } from "../../../generated/prisma/client";

// Pure helpers for what a guest at the table sees (docs/TABLE_QR_SPEC.md §5.1 and §6.3).

export type TableRoundStatus = "RECEIVED" | "SENT_TO_KITCHEN" | "PREPARING" | "READY" | "SERVED" | "CANCELLED";

// A round's status for the guest's phone, read off the order and its items (Order.status alone never
// says "preparing" or "ready" — those live on the items, like the order taker's and website's views).
export function deriveTableRoundStatus(status: OrderStatus, itemStatuses: OrderItemStatus[]): TableRoundStatus {
  if (status === OrderStatus.CANCELLED) {
    return "CANCELLED";
  }
  if (status === OrderStatus.AWAITING_RECEPTION || status === OrderStatus.SCHEDULED) {
    return "RECEIVED";
  }
  if (status === OrderStatus.COMPLETED) {
    return "SERVED";
  }
  if (itemStatuses.length > 0 && itemStatuses.every((item) => item === OrderItemStatus.SERVED)) {
    return "SERVED";
  }
  if (itemStatuses.some((item) => item === OrderItemStatus.PREPARING)) {
    return "PREPARING";
  }
  if (
    itemStatuses.some((item) => item === OrderItemStatus.READY) &&
    itemStatuses.every((item) => item === OrderItemStatus.READY || item === OrderItemStatus.SERVED)
  ) {
    return "READY";
  }
  return "SENT_TO_KITCHEN";
}

export type TableClosedReason = "qr_disabled" | "no_business_day" | "not_seated" | "unavailable";

export interface OrderingStateInput {
  tableQrEnabled: boolean;
  tableActive: boolean;
  outOfService: boolean;
  // The open session's business day, or null when the table isn't seated.
  sessionBusinessDayId: string | null;
  activeBusinessDayId: string | null;
}

// Whether a guest may send a round right now, and if not, the reason the page shows. The same answer
// is given to the read-only landing page (GET /:qrKey), the poll, and enforced by POST /orders.
export function computeTableOrdering(input: OrderingStateInput): { orderingOpen: boolean; closedReason: TableClosedReason | null } {
  const closed = (closedReason: TableClosedReason) => ({ orderingOpen: false, closedReason });
  if (!input.tableQrEnabled) {
    return closed("qr_disabled");
  }
  if (!input.tableActive || input.outOfService) {
    return closed("unavailable");
  }
  if (input.sessionBusinessDayId === null) {
    return closed("not_seated");
  }
  // A session seated before the day ended can't order into the next day (spec Conflict C15).
  if (input.activeBusinessDayId === null || input.activeBusinessDayId !== input.sessionBusinessDayId) {
    return closed("no_business_day");
  }
  return { orderingOpen: true, closedReason: null };
}
