import type { OrderItemStatus, OrderStatus } from "../api/orders";
import { deriveDisplayStatus } from "../lib/displayStatus";
import { formatShopTime } from "../lib/shopTime";
import { StatusBadge } from "./ui";

// An order's status badge. A SCHEDULED order shows when it's due — "Scheduled · 3:30 PM",
// in Pakistan time — so it reads as on hold, not as a live order, wherever it appears
// before release. An open order whose items the kitchen has picked up reads "In kitchen",
// "Ready" or "Served" (derived from the items, see lib/displayStatus.ts).
export function OrderStatusBadge({
  order,
}: {
  order: { status: OrderStatus; scheduledFor: string | null; items?: { status: OrderItemStatus }[] };
}) {
  if (order.status === "SCHEDULED" && order.scheduledFor) {
    return <StatusBadge status="SCHEDULED" label={`Scheduled · ${formatShopTime(order.scheduledFor)}`} />;
  }
  const display = deriveDisplayStatus(order);
  if (display) {
    return <StatusBadge status={display.status} label={display.label} />;
  }
  return <StatusBadge status={order.status} />;
}
