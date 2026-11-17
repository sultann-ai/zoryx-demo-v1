import { describe, expect, it } from "vitest";
import { Prisma } from "../../generated/prisma/client";
import { computeOrderTotal } from "./orderTotals";

const d = (value: string | number) => new Prisma.Decimal(value);

describe("computeOrderTotal", () => {
  it("is items + deals − discount + delivery fee", () => {
    const total = computeOrderTotal({ itemsTotal: d("1000"), dealLinesTotal: d("499.50"), discount: d("100"), deliveryFee: d("150") });
    expect(total.toString()).toBe("1549.5");
  });

  it("keeps the delivery fee when the discount is recomputed (accept-with-discount, submission edit)", () => {
    const base = { itemsTotal: d("800"), dealLinesTotal: d("0"), deliveryFee: d("200") };
    expect(computeOrderTotal({ ...base, discount: d("0") }).toString()).toBe("1000");
    expect(computeOrderTotal({ ...base, discount: d("50") }).toString()).toBe("950");
  });

  it("works with no fee (every non-guest order)", () => {
    expect(computeOrderTotal({ itemsTotal: d("300"), dealLinesTotal: d("200"), discount: d("0"), deliveryFee: d("0") }).toString()).toBe("500");
  });

  it("is exact with fractional money (no floating-point drift)", () => {
    const total = computeOrderTotal({ itemsTotal: d("0.1"), dealLinesTotal: d("0.2"), discount: d("0"), deliveryFee: d("0.30") });
    expect(total.toString()).toBe("0.6");
  });
});
