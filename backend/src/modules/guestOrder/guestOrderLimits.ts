// Guest-order abuse limits. Counted in Postgres (so they survive restarts and deploys) inside the
// order-creation transaction; this file is just the numbers and the decision.
export const GUEST_LIMITS = {
  ipPerTenMinutes: 5,
  ipPerDay: 30,
  phoneAwaitingReception: 3,
  phonePerDay: 10,
  // Pickup orders staff marked "Not collected" (a strike): this many within NOT_COLLECTED_WINDOW_MS blocks the phone.
  phoneNotCollected: 3,
} as const;

export const TEN_MINUTES_MS = 10 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
export const NOT_COLLECTED_WINDOW_MS = 90 * ONE_DAY_MS;

export interface GuestLimitCounts {
  ipLastTenMinutes: number;
  ipLastDay: number;
  phoneAwaitingReception: number;
  phoneLastDay: number;
  /** Orders from this phone marked "Not collected" within NOT_COLLECTED_WINDOW_MS. */
  phoneNotCollected: number;
}

// True when creating one more order would exceed a limit — i.e. the existing count has already
// reached it.
export function exceedsGuestLimits(counts: GuestLimitCounts): boolean {
  return (
    counts.ipLastTenMinutes >= GUEST_LIMITS.ipPerTenMinutes ||
    counts.ipLastDay >= GUEST_LIMITS.ipPerDay ||
    counts.phoneAwaitingReception >= GUEST_LIMITS.phoneAwaitingReception ||
    counts.phoneLastDay >= GUEST_LIMITS.phonePerDay ||
    counts.phoneNotCollected >= GUEST_LIMITS.phoneNotCollected
  );
}
