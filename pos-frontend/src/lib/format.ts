import { shop } from "../config/shop";

// "Rs 1,850" — drops the decimals when they're exactly .00, keeps them otherwise (e.g. "Rs
// 1,850.50"). Display only — never changes the value that's sent or stored (money is always a
// Decimal string from the API; this only formats it for reading).
export function formatMoney(value: string | number): string {
  const amount = Number(value);
  const hasFraction = Math.round(amount * 100) % 100 !== 0;
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${shop.currencyLabel} ${formatted}`;
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    timeZone: shop.timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  });
}

// Time only, no date — for the kitchen ticket, which cares about "when did this come in
// during today's shift," not the calendar date.
export function formatTime(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-US", {
    timeZone: shop.timeZone,
    timeStyle: "short",
  });
}
