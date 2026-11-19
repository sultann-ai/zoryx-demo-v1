import { Prisma } from "../../../generated/prisma/client";

// The table bill's money, as pure functions (docs/TABLE_QR_SPEC.md §7.2, §7.4). Everything is
// Prisma.Decimal, never a JS number. Rounding is always to whole rupees, downwards, with the remainder
// (rupees and any paisa) going to the first share, so the shares add up to the bill total exactly.
// assertSharesSumTo() is checked after every computation: a mismatch is a bug and throws, never a silent fix.

type Decimal = Prisma.Decimal;
const D = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);
const ZERO = D(0);

export const MAX_SHARES = 20;

/** A refusal the caller turns into a 400/409 with this code (and `extra` in the body). */
export class SplitMathError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** The invariant broke: a programming error, not a user mistake (500 + log). */
export class SplitInvariantError extends Error {}

export interface ComputedShare {
  position: number;
  amount: Decimal;
  guestId: string | null;
  label: string;
}

const floorRupees = (value: Decimal): Decimal => value.toDecimalPlaces(0, Prisma.Decimal.ROUND_FLOOR);
const sum = (values: Decimal[]): Decimal => values.reduce((acc, value) => acc.plus(value), ZERO);

/** Whole rupees: no paisa at all. */
export const isWholeRupees = (value: Decimal): boolean => value.isInteger();

/** At most two decimals (paisa), the only precision money is stored with. */
export const hasAtMostTwoDecimals = (value: Decimal): boolean => value.decimalPlaces() <= 2;

export function assertSharesSumTo(shares: { amount: Decimal }[], total: Decimal): void {
  if (shares.length === 0) {
    throw new SplitInvariantError("A split produced no shares");
  }
  for (const share of shares) {
    if (share.amount.isNegative() || !hasAtMostTwoDecimals(share.amount)) {
      throw new SplitInvariantError(`A share came out as ${share.amount.toString()}`);
    }
  }
  const total2 = sum(shares.map((share) => share.amount));
  if (!total2.equals(total)) {
    throw new SplitInvariantError(`Shares add up to ${total2.toString()}, the bill is ${total.toString()}`);
  }
}

function assertTotal(total: Decimal): void {
  if (total.isNegative() || !hasAtMostTwoDecimals(total)) {
    throw new SplitInvariantError(`Bill total ${total.toString()} can't be split`);
  }
}

// ---------- EQUAL ----------

/** EQUAL(N): shares 2..N get floor(total / N) whole rupees; share 1 gets the rest (rupees and paisa). */
export function computeEqualShares(total: Decimal, parts: number): ComputedShare[] {
  assertTotal(total);
  if (!Number.isInteger(parts) || parts < 1 || parts > MAX_SHARES) {
    throw new SplitMathError("BAD_REQUEST", `parts must be a whole number from 1 to ${MAX_SHARES}`);
  }
  const base = floorRupees(total.dividedBy(parts));
  const first = total.minus(base.times(parts - 1));
  const shares = Array.from({ length: parts }, (_, i) => ({
    position: i + 1,
    amount: i === 0 ? first : base,
    guestId: null,
    label: `Share ${i + 1} of ${parts}`,
  }));
  assertSharesSumTo(shares, total);
  return shares;
}

// ---------- BY_ITEMS ----------

export interface BillLine {
  kind: "ITEM" | "DEAL";
  id: string;
  /** The line's gross value (before any discount). */
  subtotal: Decimal;
  /** The guest whose round added it; null for a line staff added ("the table", shared). */
  ownerGuestId: string | null;
}

export interface BillGuest {
  id: string;
  displayName: string;
  joinOrder: number;
  /** Not removed by staff. Removed guests still pay for their own lines, but don't share unclaimed ones. */
  active: boolean;
}

export interface BillClaim {
  kind: "ITEM" | "DEAL";
  lineId: string;
  guestId: string;
}

/**
 * BY_ITEMS (spec §7.4): an owned line goes to its owner, shared with whoever else claimed it; a shared
 * (staff-added) line goes to its claimers, or to every active guest when nobody claimed it. Each guest's
 * gross carries its pro-rata part of the discount (exact), then every guest but the first (by joinOrder,
 * among those owing anything) is floored to whole rupees and the first takes the rest.
 */
export function computeByItemsShares(input: {
  lines: BillLine[];
  guests: BillGuest[];
  claims: BillClaim[];
  subtotal: Decimal;
  total: Decimal;
}): ComputedShare[] {
  const { lines, guests, claims, subtotal, total } = input;
  assertTotal(total);
  const known = new Map(guests.map((guest) => [guest.id, guest]));
  const activeIds = guests.filter((guest) => guest.active).map((guest) => guest.id);
  const gross = new Map<string, Decimal>();
  const add = (guestId: string, amount: Decimal) => gross.set(guestId, (gross.get(guestId) ?? ZERO).plus(amount));

  for (const line of lines) {
    if (line.subtotal.isZero()) {
      continue;
    }
    const claimers = claims
      .filter((claim) => claim.kind === line.kind && claim.lineId === line.id && known.has(claim.guestId))
      .map((claim) => claim.guestId);
    let takers: string[];
    if (line.ownerGuestId && known.has(line.ownerGuestId)) {
      takers = [line.ownerGuestId, ...claimers.filter((id) => id !== line.ownerGuestId)];
    } else {
      takers = claimers.length > 0 ? claimers : activeIds;
    }
    takers = [...new Set(takers)];
    if (takers.length === 0) {
      throw new SplitMathError("NOBODY_TO_SHARE", "Nobody at the table can take a shared item — split equally or ask staff for a custom split");
    }
    const portion = line.subtotal.dividedBy(takers.length);
    for (const guestId of takers) {
      add(guestId, portion);
    }
  }

  const owing = guests
    .filter((guest) => (gross.get(guest.id) ?? ZERO).greaterThan(0))
    .sort((a, b) => a.joinOrder - b.joinOrder);
  const discount = subtotal.minus(total);
  const net = (guestId: string) => {
    const g = gross.get(guestId) ?? ZERO;
    return subtotal.isZero() ? ZERO : g.minus(discount.times(g).dividedBy(subtotal));
  };
  const [firstGuest, ...rest] = owing;
  if (!firstGuest) {
    throw new SplitMathError("NOTHING_TO_BILL", "There is nothing on this bill to split");
  }
  const others = rest.map((guest) => ({ guest, amount: floorRupees(net(guest.id)) }));
  const first = total.minus(sum(others.map((other) => other.amount)));
  const shares = [
    { guest: firstGuest, amount: first },
    ...others,
  ].map(({ guest, amount }, i) => ({ position: i + 1, amount, guestId: guest.id, label: guest.displayName.slice(0, 40) }));
  assertSharesSumTo(shares, total);
  return shares;
}

// ---------- CUSTOM ----------

/** CUSTOM (staff only): 1–20 amounts ≥ 0, every share but the first in whole rupees, Σ = total exactly. */
export function computeCustomShares(total: Decimal, entries: { amount: Decimal; guestId: string | null; label?: string }[]): ComputedShare[] {
  assertTotal(total);
  if (entries.length < 1 || entries.length > MAX_SHARES) {
    throw new SplitMathError("BAD_REQUEST", `A custom split has 1 to ${MAX_SHARES} shares`);
  }
  entries.forEach((entry, i) => {
    if (entry.amount.isNegative() || !hasAtMostTwoDecimals(entry.amount)) {
      throw new SplitMathError("BAD_REQUEST", `Share ${i + 1}: an amount of 0 or more, with at most 2 decimals`);
    }
    if (i > 0 && !isWholeRupees(entry.amount)) {
      throw new SplitMathError("BAD_REQUEST", `Share ${i + 1}: whole rupees only (only share 1 may carry paisa)`);
    }
  });
  const given = sum(entries.map((entry) => entry.amount));
  if (!given.equals(total)) {
    throw new SplitMathError("SPLIT_SUM_MISMATCH", `The shares add up to ${given.toFixed(2)}, the bill is ${total.toFixed(2)}`, {
      total: total.toFixed(2),
      sum: given.toFixed(2),
    });
  }
  const shares = entries.map((entry, i) => ({
    position: i + 1,
    amount: entry.amount,
    guestId: entry.guestId,
    label: (entry.label ?? `Share ${i + 1} of ${entries.length}`).slice(0, 40),
  }));
  assertSharesSumTo(shares, total);
  return shares;
}

// ---------- The bill discount, allocated onto the orders ----------

export interface DiscountTarget {
  id: string;
  orderNumber: number;
  /** Items + deal lines of the order (its discount can't go above this). */
  subtotal: Decimal;
}

/**
 * Spreads a bill discount over the billable orders pro-rata to their subtotals (spec §7.2): each part is
 * floored to whole rupees, then the remainder goes to the order with the largest subtotal (ties: the
 * lowest orderNumber), spilling to the next only if that order has no room left. Σ parts = discount.
 */
export function allocateDiscount(orders: DiscountTarget[], discount: Decimal): Map<string, Decimal> {
  const subtotal = sum(orders.map((order) => order.subtotal));
  if (discount.isNegative() || !hasAtMostTwoDecimals(discount)) {
    throw new SplitMathError("BAD_REQUEST", "discount must be 0 or more, with at most 2 decimals");
  }
  if (discount.greaterThan(subtotal)) {
    throw new SplitMathError("DISCOUNT_EXCEEDS_TOTAL", "The discount can't be more than the bill");
  }
  const parts = new Map<string, Decimal>();
  for (const order of orders) {
    parts.set(order.id, subtotal.isZero() ? ZERO : floorRupees(discount.times(order.subtotal).dividedBy(subtotal)));
  }
  let remainder = discount.minus(sum([...parts.values()]));
  const byLargest = [...orders].sort((a, b) => b.subtotal.comparedTo(a.subtotal) || a.orderNumber - b.orderNumber);
  for (const order of byLargest) {
    if (remainder.isZero()) {
      break;
    }
    const current = parts.get(order.id) ?? ZERO;
    const room = order.subtotal.minus(current);
    const take = Prisma.Decimal.min(room, remainder);
    parts.set(order.id, current.plus(take));
    remainder = remainder.minus(take);
  }
  const allocated = sum([...parts.values()]);
  if (!allocated.equals(discount)) {
    throw new SplitInvariantError(`Discount allocation adds up to ${allocated.toString()}, not ${discount.toString()}`);
  }
  return parts;
}
