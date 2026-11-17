import { describe, expect, it } from "vitest";
import { InvalidScheduleError, SCHEDULE_MAX_AHEAD_MS, parseScheduledFor } from "./order.service";

// Pure validation only — no database. Holding, the exactly-once release, the job and its
// startup catch-up, and the end-of-day guard were verified against the local dev DB; see
// docs/AS_BUILT_BACKEND.md §4.1c.
const NOW = new Date("2026-11-10T10:00:00.000Z"); // 3:00 PM Pakistan time

describe("parseScheduledFor", () => {
  it("accepts a UTC time in the future", () => {
    expect(parseScheduledFor("2026-11-10T10:30:00.000Z", NOW).toISOString()).toBe("2026-11-10T10:30:00.000Z");
  });

  it("accepts an explicit +05:00 (Pakistan) offset and stores the same instant in UTC", () => {
    expect(parseScheduledFor("2026-11-10T15:30:00+05:00", NOW).toISOString()).toBe("2026-11-10T10:30:00.000Z");
  });

  it("rejects a time with no zone (ambiguous wall-clock time)", () => {
    expect(() => parseScheduledFor("2026-11-10T15:30:00", NOW)).toThrow(InvalidScheduleError);
  });

  it("rejects now and the past", () => {
    expect(() => parseScheduledFor(NOW.toISOString(), NOW)).toThrow("scheduledFor must be in the future");
    expect(() => parseScheduledFor("2026-11-10T09:59:00Z", NOW)).toThrow("scheduledFor must be in the future");
  });

  it("accepts exactly 24 hours ahead and rejects anything later", () => {
    const limit = new Date(NOW.getTime() + SCHEDULE_MAX_AHEAD_MS);
    expect(parseScheduledFor(limit.toISOString(), NOW).getTime()).toBe(limit.getTime());
    expect(() => parseScheduledFor(new Date(limit.getTime() + 1000).toISOString(), NOW)).toThrow(
      "scheduledFor must be at most 24 hours from now",
    );
  });

  it("rejects non-strings and garbage", () => {
    expect(() => parseScheduledFor(1731232200000, NOW)).toThrow(InvalidScheduleError);
    expect(() => parseScheduledFor("not a dateZ", NOW)).toThrow(InvalidScheduleError);
    expect(() => parseScheduledFor(undefined, NOW)).toThrow(InvalidScheduleError);
  });
});
