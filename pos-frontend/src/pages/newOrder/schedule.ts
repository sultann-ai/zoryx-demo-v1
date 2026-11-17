import type { WallTime } from "../../lib/shopTime";
import { addDays, fromWallTime, toWallTime } from "../../lib/shopTime";

// Mirrors the backend's SCHEDULE_MAX_AHEAD_MS (order.service.ts) — the server re-checks
// both rules with its own clock; this is only so the cashier sees the problem first.
export const SCHEDULE_MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

export const QUICK_OFFSETS: { minutes: number; label: string }[] = [
  { minutes: 30, label: "+30 min" },
  { minutes: 60, label: "+1 hour" },
  { minutes: 120, label: "+2 hours" },
];

const MINUTE_MS = 60_000;

// Rounds up on the UTC timeline, never with the device's local clock — so the result is
// right whatever zone the device is set to (Pakistan's offset is whole hours, so a whole
// minute / 5-minute mark in UTC is one in Pakistan too).
function ceilTo(ms: number, stepMs: number): Date {
  return new Date(Math.ceil(ms / stepMs) * stepMs);
}

// now + minutes, rounded up to the next whole minute, as a Pakistan wall-clock time.
export function wallTimeIn(minutes: number, now: Date): WallTime {
  return toWallTime(ceilTo(now.getTime() + minutes * MINUTE_MS, MINUTE_MS));
}

// The default when "Schedule for later" is chosen: about 30 minutes out, on a 5-minute mark.
export function defaultScheduleWallTime(now: Date): WallTime {
  return toWallTime(ceilTo(now.getTime() + 30 * MINUTE_MS, 5 * MINUTE_MS));
}

export function todayAndTomorrow(now: Date): { today: string; tomorrow: string } {
  const today = toWallTime(now).date;
  return { today, tomorrow: addDays(today, 1) };
}

// null when the time is acceptable; otherwise what's wrong, in words for the cashier.
export function scheduleError(wall: WallTime, now: Date): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(wall.date) || !/^\d{2}:\d{2}$/.test(wall.time)) {
    return "Pick a time.";
  }
  const instant = fromWallTime(wall);
  if (instant.getTime() <= now.getTime()) {
    return "That time has already passed — pick a time in the future.";
  }
  if (instant.getTime() - now.getTime() > SCHEDULE_MAX_AHEAD_MS) {
    return "Orders can be scheduled at most 24 hours ahead.";
  }
  return null;
}
