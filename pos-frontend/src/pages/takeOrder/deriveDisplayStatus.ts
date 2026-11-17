import type { OrderDetail } from "../../api/orders";

// Order.status itself never reaches IN_KITCHEN/READY for an order-taker order (only PENDING once
// accepted, then CANCELLED if rejected/cancelled, or COMPLETED once staff mark it delivered — see the
// plan's note on emitOrderStatusToTaker) — so "In kitchen"/"Ready"/"Served" are otherwise
// derived from the order's own items' OrderItemStatus instead.
export type TakerDisplayStatus = "AWAITING_RECEPTION" | "IN_KITCHEN" | "READY" | "SERVED" | "CANCELLED";

export function deriveDisplayStatus(order: OrderDetail): TakerDisplayStatus {
  if (order.status === "AWAITING_RECEPTION") {
    return "AWAITING_RECEPTION";
  }
  if (order.status === "CANCELLED") {
    return "CANCELLED";
  }
  // Marked delivered/handed over by staff: finished, whatever the items' own statuses say.
  if (order.status === "COMPLETED") {
    return "SERVED";
  }
  if (order.items.length === 0) {
    return "IN_KITCHEN";
  }
  if (order.items.some((item) => item.status === "PENDING" || item.status === "PREPARING")) {
    return "IN_KITCHEN";
  }
  if (order.items.every((item) => item.status === "SERVED")) {
    return "SERVED";
  }
  // Everything is READY, or a READY/SERVED mix — judgment call: read as "Ready" until
  // every item is served.
  return "READY";
}

export const TAKER_DISPLAY_STATUS_LABEL: Record<TakerDisplayStatus, string> = {
  AWAITING_RECEPTION: "Waiting at reception",
  IN_KITCHEN: "In kitchen",
  READY: "Ready",
  SERVED: "Served",
  // Overridden to "Rejected" in MyOrderCard when it was reception's rejection rather
  // than the taker's own cancel — see cancelledReason's fixed "Cancelled by the order
  // taker" text for the self-cancel case.
  CANCELLED: "Cancelled",
};
