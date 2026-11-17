import { Prisma } from "../../generated/prisma/client";

// Small shared helpers for hand-rolled request validation (same style as the controllers:
// return a value or an error string, never throw).

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });
const fail = <T>(error: string): Parsed<T> => ({ ok: false, error });

// Required text: a non-empty trimmed string no longer than `max`.
export function parseRequiredText(field: string, value: unknown, max: number): Parsed<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(`${field} is required`);
  }
  if (value.trim().length > max) {
    return fail(`${field} must be at most ${max} characters`);
  }
  return ok(value.trim());
}

// Optional text: a string (trimmed, "" becomes null) or null. Never undefined — callers check
// for an absent key first.
export function parseNullableText(field: string, value: unknown, max: number): Parsed<string | null> {
  if (value === null) {
    return ok(null);
  }
  if (typeof value !== "string") {
    return fail(`${field} must be a string or null`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return fail(`${field} must be at most ${max} characters`);
  }
  return ok(trimmed.length === 0 ? null : trimmed);
}

export function parseSortOrder(value: unknown): Parsed<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100000) {
    return fail("sortOrder must be an integer between 0 and 100000");
  }
  return ok(value);
}

export function parseBoolean(field: string, value: unknown): Parsed<boolean> {
  return typeof value === "boolean" ? ok(value) : fail(`${field} must be a boolean`);
}

// A non-negative money amount with at most two decimals, as a string or number.
export function parseMoney(field: string, value: unknown): Parsed<Prisma.Decimal> {
  if (typeof value !== "string" && typeof value !== "number") {
    return fail(`${field} must be a non-negative amount`);
  }
  let amount: Prisma.Decimal;
  try {
    amount = new Prisma.Decimal(value);
  } catch {
    return fail(`${field} must be a non-negative amount`);
  }
  if (amount.isNaN() || !amount.isFinite() || amount.isNegative()) {
    return fail(`${field} must be a non-negative amount`);
  }
  if (amount.decimalPlaces() > 2) {
    return fail(`${field} must have at most 2 decimal places`);
  }
  if (amount.greaterThan(99_999_999.99)) {
    return fail(`${field} is too large`);
  }
  return ok(amount);
}

// http(s) URLs only: these are rendered as links on the public website, so javascript: / data:
// and friends must never get in.
export function parseHttpUrl(field: string, value: unknown, max = 500): Parsed<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fail(`${field} must be an http(s) URL`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return fail(`${field} must be at most ${max} characters`);
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fail(`${field} must be an http(s) URL`);
    }
  } catch {
    return fail(`${field} must be an http(s) URL`);
  }
  return ok(trimmed);
}

export function parseNullableHttpUrl(field: string, value: unknown): Parsed<string | null> {
  if (value === null || (typeof value === "string" && value.trim().length === 0)) {
    return ok(null);
  }
  return parseHttpUrl(field, value);
}

// Digits only, international format without "+" or leading zeros, e.g. 923001234567.
const WHATSAPP_PATTERN = /^[1-9]\d{7,14}$/;
export function parseWhatsappNumber(value: unknown): Parsed<string> {
  if (typeof value !== "string" || !WHATSAPP_PATTERN.test(value.trim())) {
    return fail("whatsappNumber must be digits only in international format, e.g. 923001234567");
  }
  return ok(value.trim());
}

// For PATCH-style bodies that may only touch a fixed set of fields: returns the first key not
// in `allowed`, so a forbidden field (a price sent by a role that may not set it) is a loud 400
// instead of being silently ignored.
export function findDisallowedKey(body: Record<string, unknown>, allowed: readonly string[]): string | null {
  return Object.keys(body).find((key) => !allowed.includes(key)) ?? null;
}
