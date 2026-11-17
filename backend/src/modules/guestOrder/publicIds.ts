import { randomBytes, randomInt } from "crypto";

// No 0/O/1/I/L: a code read out over the phone can't be mistaken.
export const PUBLIC_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const PUBLIC_CODE_LENGTH = 5;

// The customer's status link: 128 random bits, URL-safe, 22 characters. Unguessable, so knowing
// it is the authorisation to see the order's status.
export function generatePublicId(): string {
  return randomBytes(16).toString("base64url");
}

export function generatePublicCode(): string {
  let code = "";
  for (let i = 0; i < PUBLIC_CODE_LENGTH; i += 1) {
    code += PUBLIC_CODE_ALPHABET[randomInt(PUBLIC_CODE_ALPHABET.length)];
  }
  return code;
}

const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22,64}$/;

// Cheap shape check before touching the database with a path parameter.
export function isPlausiblePublicId(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_ID_PATTERN.test(value);
}

// For lookups by code: trims, upper-cases, ignores spaces/dashes, and returns null unless the
// result is a possible code (right length, only alphabet characters).
export function normalizePublicCode(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  if (code.length !== PUBLIC_CODE_LENGTH) {
    return null;
  }
  return [...code].every((character) => PUBLIC_CODE_ALPHABET.includes(character)) ? code : null;
}
