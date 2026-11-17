// Pakistan time helpers. Every report groups by business day and labels a day by the date it
// OPENED in Asia/Karachi — never by UTC, so a day opened at 1 AM Karachi (8 PM UTC the
// evening before) stays on its Karachi date. Dates are plain "YYYY-MM-DD" strings so no
// timezone can creep in through a Date's local midnight.

export const PK_TIME_ZONE = "Asia/Karachi";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: PK_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// The Karachi calendar date of an instant.
export function karachiDate(instant: Date): string {
  return dateFormat.format(instant);
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = DATE_RE.exec(value);
  if (!match) {
    return false;
  }
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
}

function toUtcDay(date: string): number {
  const [, y, m, d] = DATE_RE.exec(date) as RegExpExecArray;
  return Date.UTC(Number(y), Number(m) - 1, Number(d));
}

function fromUtcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  return fromUtcDay(toUtcDay(date) + days * DAY_MS);
}

// Whole days from `from` to `to` (to - from).
export function diffDays(from: string, to: string): number {
  return Math.round((toUtcDay(to) - toUtcDay(from)) / DAY_MS);
}

// 1 = Monday ... 7 = Sunday. Weeks run Monday to Sunday.
export function isoWeekday(date: string): number {
  const day = new Date(toUtcDay(date)).getUTCDay();
  return day === 0 ? 7 : day;
}

export function mondayOf(date: string): string {
  return addDays(date, -(isoWeekday(date) - 1));
}

export function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function lastOfMonth(date: string): string {
  return fromUtcDay(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)), 0));
}

// Every date from `from` to `to`, inclusive.
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    out.push(d);
  }
  return out;
}

// Accepts a "YYYY-MM-DD" date as-is, or any other parseable date/time and converts it to its
// Karachi date (so older callers that send a full ISO timestamp keep working).
export function toKarachiDateParam(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  if (isDateString(value)) {
    return value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : karachiDate(parsed);
}
