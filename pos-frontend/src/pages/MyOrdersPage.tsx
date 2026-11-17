import { useCurrentBusinessDay } from "../hooks/useBusinessDay";
import { useOrdersList } from "../hooks/useOrders";
import { EmptyState, PageHeader } from "../components/ui";
import { MyOrderCard } from "./takeOrder/MyOrderCard";

// listOrders already orders newest-first (createdAt desc) and, for an ORDER_TAKER
// caller, is already scoped server-side to that taker's own orders — no client-side
// filter/sort needed here beyond picking today's business day.
export function MyOrdersPage() {
  const { data: currentBusinessDay } = useCurrentBusinessDay();
  const { data: orders, isLoading, isError } = useOrdersList(
    currentBusinessDay ? { businessDayId: currentBusinessDay.id } : {},
  );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="My Orders" />

      {isLoading && <p className="text-body text-ink-muted">Loading…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load your orders.</p>}

      {orders && orders.length === 0 && <EmptyState title="No orders yet today" />}

      {orders && orders.length > 0 && (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <MyOrderCard key={order.id} summary={order} />
          ))}
        </div>
      )}
    </div>
  );
}
