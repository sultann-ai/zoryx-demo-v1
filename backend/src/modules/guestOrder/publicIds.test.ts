import { describe, expect, it } from "vitest";
import {
  generatePublicCode,
  generatePublicId,
  isPlausiblePublicId,
  normalizePublicCode,
  PUBLIC_CODE_ALPHABET,
} from "./publicIds";

describe("generatePublicId", () => {
  it("is URL-safe, at least 22 characters, and unique", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const id = generatePublicId();
      expect(id).toMatch(/^[A-Za-z0-9_-]{22,}$/);
      ids.add(id);
    }
    expect(ids.size).toBe(500);
  });

  it("is accepted by the plausibility check; junk is not", () => {
    expect(isPlausiblePublicId(generatePublicId())).toBe(true);
    for (const bad of ["", "short", "has spaces in it which is not allowed", "a/b/c/d/e/f/g/h/i/j/k/l/m", 42, undefined, "x".repeat(65)]) {
      expect(isPlausiblePublicId(bad), String(bad)).toBe(false);
    }
  });
});

describe("generatePublicCode", () => {
  it("is 5 characters from the alphabet with no look-alikes", () => {
    expect(PUBLIC_CODE_ALPHABET).toBe("23456789ABCDEFGHJKMNPQRSTUVWXYZ");
    for (const banned of ["0", "O", "1", "I", "L"]) {
      expect(PUBLIC_CODE_ALPHABET).not.toContain(banned);
    }
    for (let i = 0; i < 2000; i += 1) {
      expect(generatePublicCode()).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
    }
  });

  it("uses the whole alphabet (not stuck on a few characters)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i += 1) {
      for (const character of generatePublicCode()) seen.add(character);
    }
    expect(seen.size).toBe(PUBLIC_CODE_ALPHABET.length);
  });
});

describe("normalizePublicCode", () => {
  it("upper-cases, trims and ignores spaces/dashes", () => {
    expect(normalizePublicCode("k7p2m")).toBe("K7P2M");
    expect(normalizePublicCode("  K7P2M ")).toBe("K7P2M");
    expect(normalizePublicCode("K7-P2M")).toBe("K7P2M");
  });

  it("rejects wrong length and characters outside the alphabet", () => {
    for (const bad of ["K7P2", "K7P2MM", "K7P20", "K7PIM", "K7P-1M", "", undefined, 12345]) {
      expect(normalizePublicCode(bad), String(bad)).toBeNull();
    }
  });
});
