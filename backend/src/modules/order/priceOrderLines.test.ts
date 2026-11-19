import { describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import type { AddOnWithPrices, DealWithItems, MenuItemWithVariants, OrderPricingCatalog } from "./order.service";
import { InvalidOrderItemsError, priceOrderLines } from "./order.service";

// The pure pricing step (no database): what createOrder and the demo seed both price through.
vi.mock("../../config/prisma", () => ({ prisma: {} }));
vi.mock("../../config/socket", () => ({ getIO: () => undefined }));

const D = (value: number) => new Prisma.Decimal(value);

function menuItem(over: Partial<MenuItemWithVariants> & { id: string }): MenuItemWithVariants {
  return {
    name: over.id,
    description: null,
    price: null,
    slug: over.id,
    sellableAlone: true,
    isOpenPrice: false,
    minPrice: null,
    maxPrice: null,
    kitchenId: "kitchen-scoop",
    categoryId: "cat-scoops",
    imageUrl: null,
    imageId: null,
    nameUr: null,
    descriptionUr: null,
    isFeatured: false,
    sortOrder: 0,
    isAvailableInPOS: true,
    isAvailableOnline: true,
    isAvailableOnQr: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    variants: [],
    ...over,
  };
}

const lotus = menuItem({
  id: "lotus",
  variants: [
    { id: "lotus-single", menuItemId: "lotus", label: "Single", price: D(350), sortOrder: 0 },
    { id: "lotus-double", menuItemId: "lotus", label: "Double", price: D(600), sortOrder: 1 },
  ],
});
const chai = menuItem({ id: "chai", price: D(180), kitchenId: "kitchen-bar", categoryId: "cat-chai" });
const pastry = menuItem({ id: "pastry", price: D(350), kitchenId: "kitchen-bakery", categoryId: "cat-slices" });
const waffleCone: AddOnWithPrices = {
  id: "waffle",
  name: "Waffle Cone",
  categoryId: "cat-scoops",
  prices: [
    { id: "w1", addOnId: "waffle", size: "Single", price: D(100) },
    { id: "w2", addOnId: "waffle", size: "Double", price: D(120) },
  ],
};
const chaiAndCake = {
  id: "deal-chai-cake",
  name: "Chai & Cake",
  price: D(450),
  items: [
    { id: "di1", dealId: "deal-chai-cake", menuItemId: "chai", quantity: 1, menuItem: { id: "chai", kitchenId: "kitchen-bar" } },
    { id: "di2", dealId: "deal-chai-cake", menuItemId: "pastry", quantity: 1, menuItem: { id: "pastry", kitchenId: "kitchen-bakery" } },
  ],
} as unknown as DealWithItems;

const catalog: OrderPricingCatalog = {
  menuItemById: new Map([lotus, chai, pastry].map((item) => [item.id, item])),
  addOnById: new Map([[waffleCone.id, waffleCone]]),
  dealById: new Map([[chaiAndCake.id, chaiAndCake]]),
};

describe("priceOrderLines", () => {
  it("prices a sized line with its add-ons, and keeps the note", () => {
    const { orderItemsCreateData } = priceOrderLines(
      [{ menuItemId: "lotus", quantity: 2, variantId: "lotus-double", addOnIds: ["waffle"], notes: "extra chocolate" }],
      [],
      catalog,
    );
    expect(orderItemsCreateData).toEqual([
      expect.objectContaining({
        kitchenId: "kitchen-scoop",
        variantLabel: "Double",
        unitPrice: D(720),
        subtotal: D(1440),
        addOns: [{ addOnId: "waffle", name: "Waffle Cone", price: "120" }],
        notes: "extra chocolate",
      }),
    ]);
  });

  it("charges a standard deal at its price and explodes it into each kitchen's items", () => {
    const { pendingDealLines } = priceOrderLines([], [{ dealId: "deal-chai-cake", quantity: 2 }], catalog);
    expect(pendingDealLines[0]).toMatchObject({ dealName: "Chai & Cake", unitPrice: D(450), subtotal: D(900), baseUnitPrice: D(450) });
    expect(pendingDealLines[0]!.explodedItems).toEqual([
      expect.objectContaining({ menuItemId: "chai", kitchenId: "kitchen-bar", quantity: 2 }),
      expect.objectContaining({ menuItemId: "pastry", kitchenId: "kitchen-bakery", quantity: 2 }),
    ]);
  });

  it("refuses a sized item without a size, exactly as createOrder does", () => {
    expect(() => priceOrderLines([{ menuItemId: "lotus", quantity: 1 }], [], catalog)).toThrow(InvalidOrderItemsError);
  });
});
