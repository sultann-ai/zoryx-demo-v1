import { Prisma } from "../../generated/prisma/client";

// The one place an order's total is computed from its parts: items + deal lines − discount +
// delivery fee. Every code path that recomputes totalAmount from lines (create, submission edit,
// accept-with-discount, payment-status discount, change review) goes through this, so a stored
// delivery fee can never be silently dropped by one of them.
export function computeOrderTotal(parts: {
  itemsTotal: Prisma.Decimal;
  dealLinesTotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  deliveryFee: Prisma.Decimal;
}): Prisma.Decimal {
  return parts.itemsTotal.plus(parts.dealLinesTotal).minus(parts.discount).plus(parts.deliveryFee);
}
