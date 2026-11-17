import { describe, expect, it } from "vitest";
import { DINING_AREA_SECTION_MAX_LENGTH, InvalidDiningAreaSectionError, parseAreaField } from "./diningArea.service";

// Pure validation only — no database. Persisting/clearing `area` through the routes was
// verified against the local dev DB; see docs/AS_BUILT_BACKEND.md.
describe("parseAreaField", () => {
  it("leaves the field alone when it isn't sent", () => {
    expect(parseAreaField(undefined)).toBeUndefined();
  });

  it("treats null, empty and whitespace-only as no area", () => {
    expect(parseAreaField(null)).toBeNull();
    expect(parseAreaField("")).toBeNull();
    expect(parseAreaField("   ")).toBeNull();
  });

  it("trims and collapses inner whitespace so spellings don't split into separate chips", () => {
    expect(parseAreaField("  Family   Hall ")).toBe("Family Hall");
  });

  it(`accepts exactly ${DINING_AREA_SECTION_MAX_LENGTH} characters and rejects more`, () => {
    expect(parseAreaField("a".repeat(DINING_AREA_SECTION_MAX_LENGTH))).toBe("a".repeat(DINING_AREA_SECTION_MAX_LENGTH));
    expect(() => parseAreaField("a".repeat(DINING_AREA_SECTION_MAX_LENGTH + 1))).toThrow(InvalidDiningAreaSectionError);
  });

  it("rejects a non-string", () => {
    expect(() => parseAreaField(3)).toThrow("area must be a string or null");
  });
});
