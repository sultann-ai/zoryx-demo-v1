import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "./password";

describe("validateNewPassword", () => {
  it("requires a non-empty string", () => {
    expect(validateNewPassword(undefined)).toBe("password is required");
    expect(validateNewPassword(1234567890)).toBe("password is required");
    expect(validateNewPassword("")).toBe("password is required");
  });

  it("rejects anything shorter than the minimum", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    expect(validateNewPassword("1234567")).toBe("password must be at least 8 characters");
  });

  it("accepts exactly the minimum and longer", () => {
    expect(validateNewPassword("12345678")).toBeNull();
    expect(validateNewPassword("a much longer passphrase")).toBeNull();
  });
});
