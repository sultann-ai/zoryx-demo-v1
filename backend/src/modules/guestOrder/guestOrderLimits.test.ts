import { describe, expect, it } from "vitest";
import { hashClientIp } from "./clientIp";
import { exceedsGuestLimits, GUEST_LIMITS, GuestLimitCounts, NOT_COLLECTED_WINDOW_MS } from "./guestOrderLimits";

const none: GuestLimitCounts = { ipLastTenMinutes: 0, ipLastDay: 0, phoneAwaitingReception: 0, phoneLastDay: 0, phoneNotCollected: 0 };

describe("exceedsGuestLimits", () => {
  it("has the agreed numbers", () => {
    expect(GUEST_LIMITS).toEqual({ ipPerTenMinutes: 5, ipPerDay: 30, phoneAwaitingReception: 3, phonePerDay: 10, phoneNotCollected: 3 });
    expect(NOT_COLLECTED_WINDOW_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });

  it("allows an order while every count is under its limit", () => {
    expect(exceedsGuestLimits(none)).toBe(false);
    expect(
      exceedsGuestLimits({ ipLastTenMinutes: 4, ipLastDay: 29, phoneAwaitingReception: 2, phoneLastDay: 9, phoneNotCollected: 2 }),
    ).toBe(false);
  });

  it("refuses the order once any single limit has been reached", () => {
    expect(exceedsGuestLimits({ ...none, ipLastTenMinutes: 5 })).toBe(true);
    expect(exceedsGuestLimits({ ...none, ipLastDay: 30 })).toBe(true);
    expect(exceedsGuestLimits({ ...none, phoneAwaitingReception: 3 })).toBe(true);
    expect(exceedsGuestLimits({ ...none, phoneLastDay: 10 })).toBe(true);
    // A phone with 3 "Not collected" pickup no-shows in 90 days is refused (a strike rule).
    expect(exceedsGuestLimits({ ...none, phoneNotCollected: 3 })).toBe(true);
  });
});

describe("hashClientIp", () => {
  it("is stable, hex, and never contains the address", () => {
    const hash = hashClientIp("203.0.113.7", "secret");
    expect(hash).toBe(hashClientIp("203.0.113.7", "secret"));
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
    expect(hash).not.toContain("203");
  });

  it("differs per address and per secret", () => {
    expect(hashClientIp("203.0.113.7", "secret")).not.toBe(hashClientIp("203.0.113.8", "secret"));
    expect(hashClientIp("203.0.113.7", "secret")).not.toBe(hashClientIp("203.0.113.7", "other"));
  });

  it("buckets a missing address together instead of throwing", () => {
    expect(hashClientIp(undefined, "secret")).toBe(hashClientIp(undefined, "secret"));
  });
});
