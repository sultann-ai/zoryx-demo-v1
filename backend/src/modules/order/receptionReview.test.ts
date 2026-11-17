import { describe, expect, it } from "vitest";
import { InvalidReceptionActionError, parseAcceptInput, parseRejectInput } from "./order.service";

// Pure shape validation only — no Prisma client, no database, same pattern as
// dealCustomization.test.ts/openPrice.test.ts. The DB-dependent behaviors (submit/accept/
// reject's actual effect on stock, the kitchen queue, business-day blocking, dashboard
// totals, clientRequestId dedup, cross-account 404s) were verified manually against the
// local dev DB instead; see docs/AS_BUILT_BACKEND.md.
describe("parseAcceptInput", () => {
  it("accepts an empty body", () => {
    expect(parseAcceptInput({})).toEqual({});
  });

  it("accepts a valid paymentMethod/discount/paymentVerified combination", () => {
    const result = parseAcceptInput({ paymentMethod: "CASH", discount: 10, paymentVerified: true });
    expect(result.paymentMethod).toBe("CASH");
    expect(result.discount?.toString()).toBe("10");
    expect(result.paymentVerified).toBe(true);
  });

  it("rejects an invalid paymentMethod", () => {
    expect(() => parseAcceptInput({ paymentMethod: "BITCOIN" })).toThrow(InvalidReceptionActionError);
  });

  it("rejects a negative discount", () => {
    expect(() => parseAcceptInput({ discount: -5 })).toThrow(InvalidReceptionActionError);
  });

  it("rejects a non-boolean paymentVerified", () => {
    expect(() => parseAcceptInput({ paymentVerified: "yes" })).toThrow(InvalidReceptionActionError);
  });

  it("rejects an unknown field", () => {
    expect(() => parseAcceptInput({ bogus: true })).toThrow(InvalidReceptionActionError);
  });
});

describe("parseRejectInput", () => {
  it("requires a reason", () => {
    expect(() => parseRejectInput({})).toThrow(InvalidReceptionActionError);
  });

  it("rejects a blank reason", () => {
    expect(() => parseRejectInput({ reason: "   " })).toThrow(InvalidReceptionActionError);
  });

  it("trims the reason and accepts an optional paymentRejected flag", () => {
    const result = parseRejectInput({ reason: "  out of stock  ", paymentRejected: true });
    expect(result).toEqual({ reason: "out of stock", paymentRejected: true });
  });

  it("rejects a non-boolean paymentRejected", () => {
    expect(() => parseRejectInput({ reason: "out of stock", paymentRejected: "yes" })).toThrow(
      InvalidReceptionActionError,
    );
  });

  it("rejects an unknown field", () => {
    expect(() => parseRejectInput({ reason: "out of stock", bogus: true })).toThrow(InvalidReceptionActionError);
  });
});
