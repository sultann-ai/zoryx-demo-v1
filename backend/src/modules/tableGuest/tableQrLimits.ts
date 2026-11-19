// Table QR abuse limits (docs/TABLE_QR_SPEC.md §5.3). Counted in Postgres inside the write's
// transaction — order limits in createOrder's guard (after its per-business-day lock), join limits
// under the session row lock — so they survive restarts and two simultaneous requests can't both slip
// under one. This file is just the numbers and the decisions, like guestOrderLimits.ts.
export const TABLE_QR_LIMITS = {
  guestAwaitingOrders: 2,
  sessionAwaitingOrders: 4,
  orderCooldownMs: 30_000,
  sessionOrders: 30,
  orderMaxTotal: 50_000,
  sessionGuests: 20,
  pinFailures: 10,
  joinsPerIpHashPerHour: 40,
  // Waiter calls (build step 3).
  callCooldownMs: 60_000,
  sessionOpenCalls: 3,
} as const;

export const ONE_HOUR_MS = 60 * 60 * 1000;

export interface TableOrderCounts {
  guestAwaiting: number;
  sessionAwaiting: number;
  sessionOrders: number;
  // When this guest's last round was sent; null if never.
  guestLastOrderAt: Date | null;
}

export type TableOrderLimitResult =
  | { ok: true }
  | { ok: false; code: "TOO_MANY" }
  | { ok: false; code: "COOLDOWN"; retryAfterSeconds: number };

// Whether one more round may be sent now. The cooldown is checked last, so a guest who is over a hard
// limit is told so rather than told to wait.
export function checkTableOrderLimits(counts: TableOrderCounts, now: Date): TableOrderLimitResult {
  if (
    counts.guestAwaiting >= TABLE_QR_LIMITS.guestAwaitingOrders ||
    counts.sessionAwaiting >= TABLE_QR_LIMITS.sessionAwaitingOrders ||
    counts.sessionOrders >= TABLE_QR_LIMITS.sessionOrders
  ) {
    return { ok: false, code: "TOO_MANY" };
  }
  return checkOrderCooldown(counts.guestLastOrderAt, now);
}

export function checkOrderCooldown(lastOrderAt: Date | null, now: Date): TableOrderLimitResult {
  if (lastOrderAt !== null) {
    const waitMs = lastOrderAt.getTime() + TABLE_QR_LIMITS.orderCooldownMs - now.getTime();
    if (waitMs > 0) {
      return { ok: false, code: "COOLDOWN", retryAfterSeconds: Math.ceil(waitMs / 1000) };
    }
  }
  return { ok: true };
}

// Seconds this guest still has to wait before the next round (0 = may send now). For the poll.
export function orderCooldownSeconds(lastOrderAt: Date | null, now: Date): number {
  const result = checkOrderCooldown(lastOrderAt, now);
  return result.ok ? 0 : result.code === "COOLDOWN" ? result.retryAfterSeconds : 0;
}

// ---------- Waiter calls ----------

export interface TableCallCounts {
  // RAISED or ACKNOWLEDGED calls on the session.
  sessionOpenCalls: number;
  // When this guest last called; null if never.
  guestLastCallAt: Date | null;
}

// Whether one more call may be raised now: at most 3 open per session, and 60 s between one guest's
// calls. The cap is checked first, so a full table is told so rather than told to wait.
export function checkTableCallLimits(counts: TableCallCounts, now: Date): TableOrderLimitResult {
  if (counts.sessionOpenCalls >= TABLE_QR_LIMITS.sessionOpenCalls) {
    return { ok: false, code: "TOO_MANY" };
  }
  return checkCooldown(counts.guestLastCallAt, TABLE_QR_LIMITS.callCooldownMs, now);
}

export function callCooldownSeconds(lastCallAt: Date | null, now: Date): number {
  const result = checkCooldown(lastCallAt, TABLE_QR_LIMITS.callCooldownMs, now);
  return result.ok ? 0 : result.code === "COOLDOWN" ? result.retryAfterSeconds : 0;
}

function checkCooldown(last: Date | null, cooldownMs: number, now: Date): TableOrderLimitResult {
  if (last !== null) {
    const waitMs = last.getTime() + cooldownMs - now.getTime();
    if (waitMs > 0) {
      return { ok: false, code: "COOLDOWN", retryAfterSeconds: Math.ceil(waitMs / 1000) };
    }
  }
  return { ok: true };
}
