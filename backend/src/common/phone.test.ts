import { describe, expect, it } from "vitest";
import { normalizePkPhone } from "./phone";

describe("normalizePkPhone", () => {
  it("accepts 03XXXXXXXXX, +923XXXXXXXXX and 923XXXXXXXXX and stores 03XXXXXXXXX", () => {
    expect(normalizePkPhone("03001234567")).toBe("03001234567");
    expect(normalizePkPhone("+923001234567")).toBe("03001234567");
    expect(normalizePkPhone("923001234567")).toBe("03001234567");
  });

  it("ignores spaces and dashes", () => {
    expect(normalizePkPhone("0300 123 4567")).toBe("03001234567");
    expect(normalizePkPhone("0300-1234567")).toBe("03001234567");
    expect(normalizePkPhone("+92 300 1234567")).toBe("03001234567");
    expect(normalizePkPhone("  92-300-123-4567 ")).toBe("03001234567");
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "0300123456", // too short
      "030012345678", // too long
      "02001234567", // not a mobile (03...)
      "+920300123456", // stray 0 after the country code
      "00923001234567", // 00 prefix isn't one of the accepted forms
      "0300-12345-67x",
      "(0300) 1234567", // parentheses aren't ignored
      "+1 555 123 4567",
      "abc",
    ]) {
      expect(normalizePkPhone(bad), bad).toBeNull();
    }
    expect(normalizePkPhone(undefined)).toBeNull();
    expect(normalizePkPhone(3001234567)).toBeNull();
    expect(normalizePkPhone(null)).toBeNull();
  });
});
