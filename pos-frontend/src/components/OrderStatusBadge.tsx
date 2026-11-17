import type { OrderStatus } from "../api/orders";
import { formatShopTime } from "../lib/shopTime";
import { StatusBadge } from "./ui";

// An order's status badge. A SCHEDULED order shows when it's due — "Scheduled · 3:30 PM",
// in Pakistan time — so it reads as on hold, not as a live order, wherever it appears
// before release.
export function OrderStatusBadge({ order }: { order: { status: OrderStatus; scheduledFor: string | null } }) {
  if (order.status === "SCHEDULED" && order.scheduledFor) {
    return <StatusBadge status="SCHEDULED" label={`Scheduled · ${formatShopTime(order.scheduledFor)}`} />;
  }
  return <StatusBadge status={order.status} />;
}
