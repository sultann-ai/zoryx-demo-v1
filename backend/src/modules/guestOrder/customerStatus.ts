import { OrderItemStatus, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "../../../generated/prisma/client";

// What the customer sees. Derived from the order and its items — never stored.
export type CustomerStatus = "RECEIVED" | "CONFIRMED" | "PREPARING" | "READY" | "ON_THE_WAY" | "DELIVERED" | "CANCELLED";

export type CustomerPaymentState =
  | "NOT_REQUIRED"
  | "WAITING_FOR_PAYMENT"
  | "PROOF_RECEIVED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_PROBLEM";

export function deriveCustomerStatus(order: {
  status: OrderStatus;
  riderId: string | null;
  itemStatuses: OrderItemStatus[];
  /** TAKEAWAY (pickup) orders are never "on the way": READY means ready to collect. */
  type?: OrderType;
}): CustomerStatus {
  switch (order.status) {
    case OrderStatus.CANCELLED:
      return "CANCELLED";
    case OrderStatus.COMPLETED:
      return "DELIVERED";
    case OrderStatus.AWAITING_RECEPTION:
    case OrderStatus.SCHEDULED:
      return "RECEIVED";
    default:
      break;
  }

  // Accepted by reception from here on. The kitchen's item statuses say how far along it is.
  const { itemStatuses } = order;
  if (itemStatuses.length > 0 && itemStatuses.every((s) => s === OrderItemStatus.READY || s === OrderItemStatus.SERVED)) {
    return order.riderId !== null && order.type !== OrderType.TAKEAWAY ? "ON_THE_WAY" : "READY";
  }
  if (itemStatuses.some((s) => s === OrderItemStatus.PREPARING)) {
    return "PREPARING";
  }
  return "CONFIRMED";
}

export function derivePaymentState(order: {
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  hasProof: boolean;
}): CustomerPaymentState {
  if (order.paymentMethod !== PaymentMethod.ONLINE) {
    return "NOT_REQUIRED";
  }
  if (order.paymentStatus === PaymentStatus.VERIFIED) {
    return "PAYMENT_CONFIRMED";
  }
  if (order.paymentStatus === PaymentStatus.REJECTED) {
    return "PAYMENT_PROBLEM";
  }
  return order.hasProof ? "PROOF_RECEIVED" : "WAITING_FOR_PAYMENT";
}
