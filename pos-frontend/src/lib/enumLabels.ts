import type { AttendanceStatus } from "../api/attendance";
import type { InventoryTxnType } from "../api/inventory";
import type { OrderSource, OrderStatus, OrderType, PaymentMethod } from "../api/orders";
import type { VendorLedgerEntryType } from "../api/vendors";

// Display text for backend enum values, in sentence case. The raw values
// (DINE_IN, HALF_DAY…) are wire format — they should never be what a person
// reads on screen. Acronyms (POS) keep their capitals.

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  DINE_IN: "Dine in",
  TAKEAWAY: "Takeaway",
  DELIVERY: "Delivery",
};

// What staff read for an order's type: an online TAKEAWAY order is a "Pickup" (the customer collects it).
export function orderTypeLabel(order: { source: OrderSource; type: OrderType }): string {
  return order.source === "ONLINE" && order.type === "TAKEAWAY" ? "Pickup" : ORDER_TYPE_LABEL[order.type];
}

export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  POS: "POS",
  ONLINE: "Online",
  PHONE: "Phone",
  ORDER_TAKER: "Order taker",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  ONLINE: "Online",
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  IN_KITCHEN: "In kitchen",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  AWAITING_RECEPTION: "Awaiting reception",
  SCHEDULED: "Scheduled",
};

export const ATTENDANCE_STATUS_LABEL: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LEAVE: "Leave",
  HALF_DAY: "Half day",
};

export const INVENTORY_TXN_LABEL: Record<InventoryTxnType, string> = {
  STOCK_IN: "Stock in",
  STOCK_OUT: "Stock out",
  ADJUSTMENT: "Adjustment",
  RESTOCK_CANCEL: "Returned (order cancelled)",
};

export const VENDOR_LEDGER_ENTRY_TYPE_LABEL: Record<VendorLedgerEntryType, string> = {
  PURCHASE: "Purchase",
  PAYMENT: "Payment",
};
