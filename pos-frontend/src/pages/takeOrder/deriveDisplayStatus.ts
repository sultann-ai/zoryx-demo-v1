import type { OrderDetail } from "../../api/orders";
import { deriveKitchenProgress } from "../../lib/displayStatus";

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
  // Accepted and open: the kitchen's progress (shared with the staff screens), "In kitchen" until
  // anything has moved.
  return deriveKitchenProgress(order.items) ?? "IN_KITCHEN";
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
