import type { OrderItemStatus, OrderStatus } from "../api/orders";

// An order's kitchen progress, read off its items — for display only. The server never writes
// IN_KITCHEN or READY onto an order; an open order stays PENDING/CONFIRMED until it's completed.
//   every item SERVED            -> SERVED   ("Served")
//   any item PREPARING           -> IN_KITCHEN ("In kitchen")
//   every item READY (or served) -> READY    ("Ready")
//   some started, some not       -> IN_KITCHEN
//   nothing started yet / none   -> null
export type KitchenProgress = "IN_KITCHEN" | "READY" | "SERVED";

export const KITCHEN_PROGRESS_LABEL: Record<KitchenProgress, string> = {
  IN_KITCHEN: "In kitchen",
  READY: "Ready",
  SERVED: "Served",
};

export function deriveKitchenProgress(items: { status: OrderItemStatus }[]): KitchenProgress | null {
  if (items.length === 0) {
    return null;
  }
  if (items.every((item) => item.status === "SERVED")) {
    return "SERVED";
  }
  if (items.some((item) => item.status === "PREPARING")) {
    return "IN_KITCHEN";
  }
  if (items.every((item) => item.status === "READY" || item.status === "SERVED")) {
    return "READY";
  }
  if (items.some((item) => item.status !== "PENDING")) {
    return "IN_KITCHEN";
  }
  return null;
}

const OPEN_STATUSES = new Set<OrderStatus>(["PENDING", "CONFIRMED"]);

// The staff screens' label for an open order (Orders list, order page): its kitchen progress, or
// null to show the order's own status (not open, or nothing started yet).
export function deriveDisplayStatus(order: {
  status: OrderStatus;
  items?: { status: OrderItemStatus }[];
}): { status: KitchenProgress; label: string } | null {
  if (!OPEN_STATUSES.has(order.status)) {
    return null;
  }
  const progress = deriveKitchenProgress(order.items ?? []);
  return progress ? { status: progress, label: KITCHEN_PROGRESS_LABEL[progress] } : null;
}
