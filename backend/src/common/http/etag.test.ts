import { describe, expect, it } from "vitest";
import { ifNoneMatchMatches } from "./etag";

describe("ifNoneMatchMatches", () => {
  const etag = '"abc-thumb"';

  it("matches an identical value, with or without the weak prefix", () => {
    expect(ifNoneMatchMatches('"abc-thumb"', etag)).toBe(true);
    expect(ifNoneMatchMatches('W/"abc-thumb"', etag)).toBe(true);
  });

  it("matches inside a comma-separated list and on *", () => {
    expect(ifNoneMatchMatches('"other", "abc-thumb"', etag)).toBe(true);
    expect(ifNoneMatchMatches("*", etag)).toBe(true);
  });

  it("does not match a different size or id, or a missing header", () => {
    expect(ifNoneMatchMatches('"abc-full"', etag)).toBe(false);
    expect(ifNoneMatchMatches('"xyz-thumb"', etag)).toBe(false);
    expect(ifNoneMatchMatches(undefined, etag)).toBe(false);
    expect(ifNoneMatchMatches("", etag)).toBe(false);
  });
});
