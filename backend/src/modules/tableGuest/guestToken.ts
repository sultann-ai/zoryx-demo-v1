import { createHash, randomBytes, randomInt } from "crypto";

// A guest's bearer token for one table session: 256 random bits, URL-safe, 43 characters. Only its
// SHA-256 is stored (TableGuest.tokenHash) — high entropy, so a plain hash is enough.
export function generateGuestToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Cheap shape check before touching the database with a header value.
export function isPlausibleGuestToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

// A new 4-digit join PIN ("0000"–"9999"), drawn fresh for every session and every rotation.
export function generateJoinPin(): string {
  return String(randomInt(10_000)).padStart(4, "0");
}

// The table's QR key: 128 random bits, 22 URL-safe characters (same shape as a guest order's status link).
export function generateQrKey(): string {
  return randomBytes(16).toString("base64url");
}

const QR_KEY_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function isPlausibleQrKey(value: unknown): value is string {
  return typeof value === "string" && QR_KEY_PATTERN.test(value);
}
