import { describe, expect, it } from "vitest";
import { InvalidOrderItemsError, parseOrderItems } from "./order.service";

// Pure shape/format validation only — no Prisma client, no database. The DB-aware half
// of open-price enforcement (resolveItemPrice's min/max/isOpenPrice checks, since those
// need the actual MenuItem row) is covered by manual verification against the local dev
// DB instead; see docs/AS_BUILT_BACKEND.md, same pattern as dealCustomization.test.ts.
describe("parseOrderItems — open-price unitPrice", () => {
  it("rejects a client-sent unitPrice when allowUnitPrice is false (the online-route default)", () => {
    expect(() => parseOrderItems([{ menuItemId: "item-1", quantity: 1, unitPrice: 120 }])).toThrow(
      InvalidOrderItemsError,
    );
  });

  it("accepts a unitPrice when allowUnitPrice is true (the POS route)", () => {
    const result = parseOrderItems([{ menuItemId: "item-1", quantity: 1, unitPrice: 120 }], {
      allowUnitPrice: true,
    });
    expect(result).toHaveLength(1);
    const [item] = result;
    if (!item) {
      throw new Error("expected a parsed item");
    }
    expect(item.unitPrice?.toString()).toBe("120");
  });

  it("rejects a unitPrice of 0 (must be greater than 0)", () => {
    expect(() =>
      parseOrderItems([{ menuItemId: "item-1", quantity: 1, unitPrice: 0 }], { allowUnitPrice: true }),
    ).toThrow(InvalidOrderItemsError);
  });

  it("rejects a negative unitPrice", () => {
    expect(() =>
      parseOrderItems([{ menuItemId: "item-1", quantity: 1, unitPrice: -5 }], { allowUnitPrice: true }),
    ).toThrow(InvalidOrderItemsError);
  });

  it("rejects a unitPrice with more than 2 decimal places", () => {
    expect(() =>
      parseOrderItems([{ menuItemId: "item-1", quantity: 1, unitPrice: 120.555 }], { allowUnitPrice: true }),
    ).toThrow(InvalidOrderItemsError);
  });

  it("rejects a unitPrice above the hard cap of 1,000,000", () => {
    expect(() =>
      parseOrderItems([{ menuItemId: "item-1", quantity: 1, unitPrice: 1_000_000.01 }], { allowUnitPrice: true }),
    ).toThrow(InvalidOrderItemsError);
  });

  it("accepts a unitPrice exactly at the hard cap", () => {
    const result = parseOrderItems([{ menuItemId: "item-1", quantity: 1, unitPrice: 1_000_000 }], {
      allowUnitPrice: true,
    });
    expect(result).toHaveLength(1);
  });

  it("leaves a normal item (no unitPrice) unaffected either way", () => {
    const result = parseOrderItems([{ menuItemId: "item-1", quantity: 2 }], { allowUnitPrice: true });
    expect(result).toEqual([{ menuItemId: "item-1", quantity: 2 }]);
  });
});
