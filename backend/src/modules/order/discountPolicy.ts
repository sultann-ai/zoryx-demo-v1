import { Prisma, StaffRole } from "../../../generated/prisma/client";

// Who may give how much discount, and what must be said about it. Applied by every path that sets
// Order.discount (createOrder, updateSubmission, acceptOrder, updatePaymentStatus) — always on the
// server-priced subtotal, never on anything the client sends.
//
//   - Only a CHANGE is checked: re-sending the discount the order already has (Confirm Payment
//     pre-fills it) needs no reason and isn't re-capped.
//   - A discount above 0 needs a reason, 1-200 characters.
//   - Anyone but a SUPER_ADMIN is capped at SiteSettings.maxDiscountPercentPosAdmin percent of the
//     items + deals subtotal (delivery fee excluded). A SUPER_ADMIN is only held to "not more than
//     the total", which each path already checks (DiscountExceedsTotalError).

export const DISCOUNT_REASON_MAX_LENGTH = 200;
export const DEFAULT_MAX_DISCOUNT_PERCENT = new Prisma.Decimal(20);

export class DiscountReasonRequiredError extends Error {
  constructor() {
    super("A reason is required for a discount");
  }
}

export class DiscountReasonTooLongError extends Error {
  constructor() {
    super(`The discount reason must be at most ${DISCOUNT_REASON_MAX_LENGTH} characters`);
  }
}

export class DiscountAboveCapError extends Error {
  constructor(public readonly capPercent: Prisma.Decimal) {
    super(`Discount above ${formatPercent(capPercent)}% needs a Super Admin`);
  }
}

// "20", "12.5" — no trailing zeros.
export function formatPercent(value: Prisma.Decimal): string {
  return value.toDecimalPlaces(2).toString();
}

export interface DiscountActor {
  actorId: string;
  role: StaffRole;
  // As typed; trimmed and validated here.
  reason?: string | null;
}

export interface DiscountCheck {
  next: Prisma.Decimal;
  current: Prisma.Decimal;
  // Items + deal lines, before discount and delivery fee.
  subtotal: Prisma.Decimal;
  actor: DiscountActor;
  capPercent: Prisma.Decimal;
}

// Returns whether the discount changes and, if it does, the reason to store (null for a discount
// set back to 0 with nothing said). Throws the error to show the user otherwise.
export function checkDiscountChange(check: DiscountCheck): { changed: false } | { changed: true; reason: string | null } {
  if (check.next.equals(check.current)) {
    return { changed: false };
  }
  const reason = typeof check.actor.reason === "string" ? check.actor.reason.trim() : "";
  if (reason.length > DISCOUNT_REASON_MAX_LENGTH) {
    throw new DiscountReasonTooLongError();
  }
  if (check.next.greaterThan(0) && reason === "") {
    throw new DiscountReasonRequiredError();
  }
  if (check.actor.role !== StaffRole.SUPER_ADMIN && check.next.greaterThan(0)) {
    const max = check.subtotal.times(check.capPercent).dividedBy(100);
    if (check.next.greaterThan(max)) {
      throw new DiscountAboveCapError(check.capPercent);
    }
  }
  return { changed: true, reason: reason === "" ? null : reason };
}

// The fields every path writes when the discount changes.
export function discountAttribution(actor: DiscountActor, reason: string | null) {
  return { discountById: actor.actorId, discountAt: new Date(), discountReason: reason };
}

// The cap in force (the single SiteSettings row; the default if it hasn't been created yet).
export async function loadDiscountCap(db: Pick<Prisma.TransactionClient, "siteSettings">): Promise<Prisma.Decimal> {
  const settings = await db.siteSettings.findUnique({ where: { id: 1 }, select: { maxDiscountPercentPosAdmin: true } });
  return settings?.maxDiscountPercentPosAdmin ?? DEFAULT_MAX_DISCOUNT_PERCENT;
}
