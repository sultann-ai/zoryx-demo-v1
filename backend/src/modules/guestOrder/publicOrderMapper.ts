import { OrderItemStatus, OrderStatus, OrderType, PaymentMethod, PaymentStatus, Prisma } from "../../../generated/prisma/client";
import { CustomerPaymentState, CustomerStatus, deriveCustomerStatus, derivePaymentState } from "./customerStatus";

// The whitelist layer for the customer's status page. Built field by field from the rows the
// database returned, never by spreading one — so no phone number, address, note, staff name or
// internal id can reach the public response, now or when a column is added later. (Internal ids
// such as deal-line ids are used below only to group rows and are not part of the output.)

type MoneyLike = { toString(): string } | string | number;

export interface SourcePublicOrder {
  publicCode: string;
  status: OrderStatus;
  type: OrderType;
  riderId: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentProofMediaId: string | null;
  paymentProofAt: Date | null;
  paymentRejectedReason: string | null;
  cancelledReason: string | null;
  discount: MoneyLike;
  deliveryFee: MoneyLike;
  totalAmount: MoneyLike;
  createdAt: Date;
  items: {
    status: OrderItemStatus;
    quantity: number;
    subtotal: MoneyLike;
    variantLabel: string | null;
    addOns: unknown;
    dealOrderLineId: string | null;
    menuItem: { name: string; nameUr: string | null };
  }[];
  dealLines: {
    id: string;
    dealName: string;
    quantity: number;
    subtotal: MoneyLike;
    deal: { nameUr: string | null } | null;
  }[];
}

export interface PublicOrderAddOn {
  name: string;
  price: string;
}

function toAddOns(raw: unknown): PublicOrderAddOn[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const { name, price } = entry as Record<string, unknown>;
    return typeof name === "string" ? [{ name, price: String(price ?? "0") }] : [];
  });
}

// Shop details a pickup customer needs to find the shop (public store content, nothing about the customer).
export interface PickupShopInfo {
  addressEn: string;
  addressUr: string;
  mapUrl: string;
  noteEn: string | null;
  noteUr: string | null;
}

export function toPublicOrderStatus(source: SourcePublicOrder, pickupShop?: PickupShopInfo) {
  const isPickup = source.type === OrderType.TAKEAWAY;
  const status: CustomerStatus = deriveCustomerStatus({
    type: source.type,
    status: source.status,
    riderId: source.riderId,
    itemStatuses: source.items.map((item) => item.status),
  });
  const paymentState: CustomerPaymentState = derivePaymentState({
    paymentMethod: source.paymentMethod,
    paymentStatus: source.paymentStatus,
    hasProof: source.paymentProofMediaId !== null,
  });

  const directItems = source.items.filter((item) => item.dealOrderLineId === null);
  const itemLines = directItems.map((item) => ({
    kind: "item" as const,
    name: item.menuItem.name,
    nameUr: item.menuItem.nameUr,
    size: item.variantLabel,
    addOns: toAddOns(item.addOns),
    quantity: item.quantity,
    lineTotal: String(item.subtotal),
  }));

  const dealLines = source.dealLines.map((line) => ({
    kind: "deal" as const,
    name: line.dealName,
    nameUr: line.deal?.nameUr ?? null,
    quantity: line.quantity,
    lineTotal: String(line.subtotal),
    contents: source.items
      .filter((item) => item.dealOrderLineId === line.id)
      .map((item) => ({
        name: item.menuItem.name,
        nameUr: item.menuItem.nameUr,
        size: item.variantLabel,
        addOns: toAddOns(item.addOns),
        quantity: item.quantity,
      })),
  }));

  // Decimal, never floating point: this is money.
  const subtotal = [...directItems.map((item) => item.subtotal), ...source.dealLines.map((line) => line.subtotal)].reduce<Prisma.Decimal>(
    (sum, value) => sum.plus(new Prisma.Decimal(String(value))),
    new Prisma.Decimal(0),
  );

  return {
    publicCode: source.publicCode,
    // Pickup wording ("Ready for pickup", "Collected") is applied by the website from this; the status values stay the same.
    orderType: isPickup ? ("PICKUP" as const) : ("DELIVERY" as const),
    status,
    // The staff reason for a cancellation or rejection (free text typed by reception).
    cancelReason: status === "CANCELLED" ? source.cancelledReason : null,
    payment: {
      method: source.paymentMethod,
      state: paymentState,
      // When the customer's current proof reached us (null when there is none, or it predates the column): the status
      // page shows "sent at ..." from this. A proof is never exposed here, only its time (the picture has its own route).
      proofSentAt: source.paymentProofMediaId !== null && source.paymentProofAt ? source.paymentProofAt.toISOString() : null,
      // Staff's reason when they turned the payment down (free text typed by reception, like cancelReason above).
      rejectReason: paymentState === "PAYMENT_PROBLEM" ? source.paymentRejectedReason : null,
    },
    lines: [...itemLines, ...dealLines],
    subtotal: subtotal.toString(),
    discount: String(source.discount),
    deliveryFee: String(source.deliveryFee),
    total: String(source.totalAmount),
    createdAt: source.createdAt,
    // Only for pickup: where to collect. Built field by field like everything else here.
    ...(isPickup && pickupShop
      ? {
          pickup: {
            addressEn: pickupShop.addressEn,
            addressUr: pickupShop.addressUr,
            mapUrl: pickupShop.mapUrl,
            noteEn: pickupShop.noteEn,
            noteUr: pickupShop.noteUr,
          },
        }
      : {}),
  };
}
