import type { OrderDetail, OrderSummary } from "../api/orders";

// Who an order is for, wherever staff see it (Incoming card, Order detail, Orders list, receipts,
// kitchen slips). An order with a Customer account row reads from it; a guest order (no account)
// reads the same things straight from the Order's own fields.
export interface OrderCustomerView {
  name: string | null;
  phone: string | null;
  // The delivery address as separate lines ("House 12, Street 5, DHA" / "Landmark: ...").
  addressLines: string[];
  areaName: string | null;
  deliveryFee: number;
  // The 5-character code a guest reads out over the phone; null for every non-guest order.
  code: string | null;
}

// An online order the customer collects at the shop: a TAKEAWAY order from the website (no address, no delivery fee).
export function isPickup(order: Pick<OrderSummary, "source" | "type">): boolean {
  return order.source === "ONLINE" && order.type === "TAKEAWAY";
}

export function getOrderCustomer(order: OrderSummary | OrderDetail): OrderCustomerView {
  // The list endpoint returns bare rows (no relations), so every relation is optional here.
  const detail = order as Partial<OrderDetail>;
  const address = order.deliveryAddress ?? detail.customerAddress?.addressText ?? null;
  return {
    name: detail.customer?.name ?? order.customerName,
    phone: detail.customer?.phone ?? order.customerPhone,
    addressLines: address ? address.split("\n").filter((line) => line.trim().length > 0) : [],
    areaName: detail.deliveryArea?.nameEn ?? null,
    deliveryFee: Number(order.deliveryFee),
    code: order.publicCode,
  };
}
