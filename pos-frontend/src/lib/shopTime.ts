import { shop } from "../config/shop";

// Wall-clock helpers in the shop's time zone (shop.timeZone, Asia/Karachi). Times travel and
// are stored as UTC instants; these convert between those and what staff see and type, so
// the result never depends on the device's own time-zone setting. Pure, React-free.

export interface WallTime {
  // "YYYY-MM-DD" and "HH:mm" as they read on a clock in the shop's zone.
  date: string;
  time: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

export function toWallTime(instant: Date, timeZone: string = shop.timeZone): WallTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

// The zone's offset from UTC at `instant`, in minutes (Pakistan: +300, no DST).
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const wall = toWallTime(instant, timeZone);
  const [year, month, day] = wall.date.split("-").map(Number);
  const [hour, minute] = wall.time.split(":").map(Number);
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  return Math.round((asUtc - Math.floor(instant.getTime() / 60_000) * 60_000) / 60_000);
}

// The instant at which a clock in `timeZone` reads `wall`. Two passes so a zone with DST
// would still resolve correctly; for Pakistan the first pass is already exact.
export function fromWallTime(wall: WallTime, timeZone: string = shop.timeZone): Date {
  const [year, month, day] = wall.date.split("-").map(Number);
  const [hour, minute] = wall.time.split(":").map(Number);
  const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
  let instant = new Date(naiveUtc - zoneOffsetMinutes(new Date(naiveUtc), timeZone) * 60_000);
  instant = new Date(naiveUtc - zoneOffsetMinutes(instant, timeZone) * 60_000);
  return instant;
}

// "YYYY-MM-DD" `days` after `date` (calendar arithmetic, zone-independent).
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

// "3:30 PM", "Tomorrow 3:30 PM", or "12 Nov, 3:30 PM" — relative to `now`'s day in the zone.
export function formatShopTime(value: string | Date, now: Date = new Date(), timeZone: string = shop.timeZone): string {
  const instant = typeof value === "string" ? new Date(value) : value;
  const time = instant.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  const day = toWallTime(instant, timeZone).date;
  const today = toWallTime(now, timeZone).date;
  if (day === today) {
    return time;
  }
  if (day === addDays(today, 1)) {
    return `Tomorrow ${time}`;
  }
  if (day === addDays(today, -1)) {
    return `Yesterday ${time}`;
  }
  return `${instant.toLocaleDateString("en-GB", { timeZone, day: "numeric", month: "short" })}, ${time}`;
}

// "in 25 min", "in 2 h 5 min", "now" — for a time still ahead; "overdue" once passed.
export function formatTimeUntil(value: string | Date, now: Date = new Date()): string {
  const minutes = Math.ceil(((typeof value === "string" ? new Date(value) : value).getTime() - now.getTime()) / 60_000);
  if (minutes < 0) {
    return "overdue";
  }
  if (minutes === 0) {
    return "now";
  }
  if (minutes < 60) {
    return `in ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `in ${hours} h` : `in ${hours} h ${rest} min`;
}
