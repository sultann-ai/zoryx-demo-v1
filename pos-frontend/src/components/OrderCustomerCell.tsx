import type { OrderSummary } from "../api/orders";
import { getOrderCustomer } from "../lib/orderCustomer";

// The Customer column of the Orders list: who it's for and, for a guest order, the code they quote.
export function OrderCustomerCell({ order }: { order: OrderSummary }) {
  const customer = getOrderCustomer(order);
  if (!customer.name && !customer.code) {
    return <span className="text-ink-muted">—</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 max-md:items-end">
      {customer.name && <span className="text-ink">{customer.name}</span>}
      {customer.phone && <span className="text-meta text-ink-muted">{customer.phone}</span>}
      {customer.code && <span className="text-meta font-semibold tracking-wider text-ink">{customer.code}</span>}
    </div>
  );
}
