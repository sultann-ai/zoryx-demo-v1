import { describe, expect, it } from "vitest";
import { InvalidOrderDealsError, parseOrderDeals } from "./order.service";

// Pure validation logic only — no Prisma client, no database. End-to-end behavior
// (exact kitchen routing, inventory deduction) is covered by manual verification
// against the local dev DB instead; see docs/AS_BUILT_BACKEND.md.
describe("parseOrderDeals", () => {
  it("parses a plain deal unchanged, with no customization", () => {
    const result = parseOrderDeals([{ dealId: "deal-1", quantity: 2 }]);
    expect(result).toEqual([{ dealId: "deal-1", quantity: 2 }]);
  });

  it("rejects customization when allowCustomization is false (the online-route default)", () => {
    expect(() =>
      parseOrderDeals([
        {
          dealId: "deal-1",
          quantity: 1,
          customization: { items: [{ menuItemId: "item-1", quantity: 1 }], finalPrice: 10 },
        },
      ]),
    ).toThrow(InvalidOrderDealsError);
  });

  it("rejects a bare finalPrice outside customization even when customization is allowed", () => {
    expect(() =>
      parseOrderDeals([{ dealId: "deal-1", quantity: 1, finalPrice: 10 }], { allowCustomization: true }),
    ).toThrow(InvalidOrderDealsError);
  });

  it("rejects quantity other than 1 when customization is set", () => {
    expect(() =>
      parseOrderDeals(
        [
          {
            dealId: "deal-1",
            quantity: 2,
            customization: { items: [{ menuItemId: "item-1", quantity: 1 }], finalPrice: 10 },
          },
        ],
        { allowCustomization: true },
      ),
    ).toThrow(InvalidOrderDealsError);
  });

  it("rejects an empty items array", () => {
    expect(() =>
      parseOrderDeals(
        [{ dealId: "deal-1", quantity: 1, customization: { items: [], finalPrice: 10 } }],
        { allowCustomization: true },
      ),
    ).toThrow(InvalidOrderDealsError);
  });

  it("rejects a negative finalPrice", () => {
    expect(() =>
      parseOrderDeals(
        [
          {
            dealId: "deal-1",
            quantity: 1,
            customization: { items: [{ menuItemId: "item-1", quantity: 1 }], finalPrice: -5 },
          },
        ],
        { allowCustomization: true },
      ),
    ).toThrow(InvalidOrderDealsError);
  });

  it("rejects a finalPrice with more than 2 decimal places", () => {
    expect(() =>
      parseOrderDeals(
        [
          {
            dealId: "deal-1",
            quantity: 1,
            customization: { items: [{ menuItemId: "item-1", quantity: 1 }], finalPrice: 10.555 },
          },
        ],
        { allowCustomization: true },
      ),
    ).toThrow(InvalidOrderDealsError);
  });

  it("accepts a valid customization and carries the parsed finalPrice/items/reason through", () => {
    const result = parseOrderDeals(
      [
        {
          dealId: "deal-1",
          quantity: 1,
          customization: {
            items: [{ menuItemId: "item-1", quantity: 1, variantId: "variant-1", addOnIds: ["addon-1"] }],
            finalPrice: 12.5,
            reason: "manager discount",
          },
        },
      ],
      { allowCustomization: true },
    );
    expect(result).toHaveLength(1);
    const [parsedDeal] = result;
    if (!parsedDeal) {
      throw new Error("expected a parsed deal");
    }
    expect(parsedDeal.customization?.finalPrice.toString()).toBe("12.5");
    expect(parsedDeal.customization?.reason).toBe("manager discount");
    expect(parsedDeal.customization?.items).toEqual([
      { menuItemId: "item-1", quantity: 1, variantId: "variant-1", addOnIds: ["addon-1"] },
    ]);
  });

  it("rejects an unknown field inside customization", () => {
    expect(() =>
      parseOrderDeals(
        [
          {
            dealId: "deal-1",
            quantity: 1,
            customization: { items: [{ menuItemId: "item-1", quantity: 1 }], finalPrice: 10, bogus: true },
          },
        ],
        { allowCustomization: true },
      ),
    ).toThrow(InvalidOrderDealsError);
  });
});
