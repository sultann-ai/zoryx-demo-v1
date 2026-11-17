// Number and date formatting for the dashboard. Money arrives as strings; parse before display.

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function toNumber(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatInt(value: number): string {
  return integer.format(value);
}

// "Rs 12,500"
export function formatRs(value: string | number | undefined): string {
  const n = toNumber(value);
  return `${n < 0 ? "-" : ""}Rs ${integer.format(Math.abs(Math.round(n)))}`;
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

// Axis labels: "Rs 12k", "Rs 1.2M".
export function formatRsCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}Rs ${trim(abs / 1_000_000)}M`;
  if (abs >= 1_000) return `${sign}Rs ${trim(abs / 1_000)}k`;
  return `${sign}Rs ${Math.round(abs)}`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio > 0 && ratio < 0.1 ? 1 : 0)}%`;
}

// Percent change versus the previous period; null when there is nothing to compare against.
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function formatChange(pct: number | null, current?: number): string {
  if (pct === null) return current && current > 0 ? "New" : "—";
  const rounded = Math.abs(pct) >= 10 ? Math.round(pct) : Math.round(pct * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

// Dates are "YYYY-MM-DD" (a Karachi business date). Parsed and printed in UTC so the browser's
// own time zone can never shift the day.
function dateOf(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function formatDateFull(date: string): string {
  return dateOf(date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateShort(date: string): string {
  return dateOf(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function formatRange(from: string, to: string): string {
  return from === to ? formatDateFull(from) : `${formatDateShort(from)} – ${formatDateShort(to)}`;
}

export function formatHour(hour: number): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? "AM" : "PM"}`;
}

export function formatHourSpan(hour: number): string {
  return `${formatHour(hour)} – ${formatHour((hour + 1) % 24)}`;
}

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAY_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Today's date in Pakistan time, for defaulting the custom range.
export function karachiToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
}

export function addDaysTo(date: string, days: number): string {
  const d = dateOf(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dateOf(to).getTime() - dateOf(from).getTime()) / 86_400_000);
}
