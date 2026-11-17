import { describe, expect, it } from "vitest";
import {
  computeOrdering,
  SourceDeal,
  SourceMenuItem,
  SourceStore,
  toPublicDeals,
  toPublicMenu,
  toPublicStore,
} from "./publicMappers";

// Every row below is seeded with SECRET-* values in columns the public site must never see. If a
// mapper ever starts spreading a row (or a new column leaks), the JSON assertion fails.
const SECRET = "SECRET";

const NOW = new Date("2026-11-10T12:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

const category = (over: Record<string, unknown> = {}) => ({
  id: "cat-1",
  name: "Chai",
  nameUr: "چائے",
  sortOrder: 1,
  imageId: null,
  image: null,
  ...over,
});

const item = (over: Record<string, unknown> = {}): SourceMenuItem =>
  ({
    id: "item-1",
    name: "Doodh Patti",
    nameUr: "دودھ پتی",
    description: "Strong tea",
    descriptionUr: "کڑک چائے",
    price: "120.00",
    slug: "doodh-patti",
    categoryId: "cat-1",
    imageUrl: null,
    imageId: "img-1",
    image: { hasTransparency: false },
    isFeatured: true,
    sortOrder: 0,
    createdAt: daysAgo(100),
    sellableAlone: true,
    isAvailableOnline: true,
    isOpenPrice: false,
    variants: [],
    // Staff-only / internal columns:
    kitchenId: `${SECRET}-KITCHEN`,
    isAvailableInPOS: false,
    minPrice: `${SECRET}-MIN`,
    maxPrice: `${SECRET}-MAX`,
    cost: `${SECRET}-COST`,
    updatedAt: `${SECRET}-DATE`,
    blob: { data: `${SECRET}-BYTES` },
    ...over,
  }) as SourceMenuItem;

const deal = (over: Record<string, unknown> = {}): SourceDeal =>
  ({
    id: "deal-1",
    name: "Family Deal",
    nameUr: "فیملی ڈیل",
    description: null,
    descriptionUr: null,
    price: "999.00",
    code: "DEAL-01",
    imageId: null,
    image: null,
    isFeatured: false,
    isActive: true,
    isAvailableOnline: true,
    items: [
      {
        id: "di-1",
        menuItemId: "item-1",
        quantity: 2,
        dealId: `${SECRET}-DEALID`,
        menuItem: { id: "item-1", name: "Doodh Patti", nameUr: null, price: "120.00", kitchenId: `${SECRET}-KITCHEN` },
      },
    ],
    createdAt: `${SECRET}-DATE`,
    isAvailableInPOS: false,
    ...over,
  }) as unknown as SourceDeal;

describe("toPublicMenu", () => {
  it("never exposes staff-only columns", () => {
    const withVariant = item({
      variants: [
        { id: "v1", label: "Small", price: "100.00", sortOrder: 0, menuItemId: `${SECRET}-MI`, addOns: [] },
      ],
    });
    const json = JSON.stringify(toPublicMenu([category()], [withVariant], NOW));
    expect(json).not.toContain(SECRET);
    expect(json).not.toMatch(/kitchenId|isAvailableInPOS|minPrice|maxPrice|isOpenPrice|sellableAlone|createdAt|updatedAt/);
  });

  it("returns only what the website needs, with Urdu text, image URLs and money as strings", () => {
    const { items, categories } = toPublicMenu([category()], [item()], NOW);
    expect(categories).toEqual([{ id: "cat-1", name: "Chai", nameUr: "چائے", sortOrder: 1, image: null }]);
    expect(items[0]).toEqual({
      id: "item-1",
      name: "Doodh Patti",
      nameUr: "دودھ پتی",
      description: "Strong tea",
      descriptionUr: "کڑک چائے",
      price: "120.00",
      slug: "doodh-patti",
      categoryId: "cat-1",
      imageUrl: null,
      image: {
        thumb: "/api/online/media/img-1?size=thumb",
        full: "/api/online/media/img-1?size=full",
        hasTransparency: false,
      },
      isFeatured: true,
      isNew: false,
      sortOrder: 0,
      orderable: true,
      variants: [],
    });
  });

  it("flags a cut-out photo per image, on items, categories and deals", () => {
    const cutout = { hasTransparency: true };
    const menu = toPublicMenu(
      [category({ imageId: "cat-img", image: cutout })],
      [item({ imageId: "img-2", image: cutout }), item({ id: "plain" })],
      NOW,
    );
    expect(menu.items.find((entry) => entry.id === "item-1")!.image).toEqual({
      thumb: "/api/online/media/img-2?size=thumb",
      full: "/api/online/media/img-2?size=full",
      hasTransparency: true,
    });
    expect(menu.items.find((entry) => entry.id === "plain")!.image!.hasTransparency).toBe(false);
    expect(menu.categories[0]!.image).toEqual({
      thumb: "/api/online/media/cat-img?size=thumb",
      full: "/api/online/media/cat-img?size=full",
      hasTransparency: true,
    });
    expect(toPublicDeals([deal({ imageId: "d-img", image: cutout })])[0]!.image!.hasTransparency).toBe(true);
  });

  it("marks an item isNew for 14 days after it was created", () => {
    const flags = (days: number) => toPublicMenu([category()], [item({ createdAt: daysAgo(days) })], NOW).items[0]!.isNew;
    expect(flags(0)).toBe(true);
    expect(flags(13.9)).toBe(true);
    expect(flags(14.1)).toBe(false);
    expect(flags(100)).toBe(false);
  });

  it("omits unavailable and open-price items even if the query let them through", () => {
    const { items } = toPublicMenu(
      [category()],
      [
        item({ id: "ok" }),
        item({ id: "off", isAvailableOnline: false }),
        item({ id: "custom", isOpenPrice: true, price: null }),
      ],
    );
    expect(items.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("returns image: null when there is no photo", () => {
    expect(toPublicMenu([category()], [item({ imageId: null, image: null })], NOW).items[0]!.image).toBeNull();
  });

  it("lists only priced sizes, in order, each with its add-ons", () => {
    const sized = item({
      price: null,
      variants: [
        { id: "v2", label: "Large", price: "300.00", sortOrder: 2, addOns: [{ id: "a1", name: "Extra cheese", price: "50.00", categoryId: `${SECRET}-CAT` }] },
        { id: "v-unpriced", label: "Party", price: null, sortOrder: 3, addOns: [] },
        { id: "v1", label: "Small", price: "100.00", sortOrder: 1, addOns: [] },
      ],
    });
    const [result] = toPublicMenu([category()], [sized]).items;
    expect(result!.variants.map((variant) => variant.label)).toEqual(["Small", "Large"]);
    expect(result!.variants[1]!.addOns).toEqual([{ id: "a1", name: "Extra cheese", price: "50.00" }]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it("flags orderable correctly: deal-only and unpriced items are not orderable", () => {
    const { items } = toPublicMenu(
      [category()],
      [
        item({ id: "plain" }),
        item({ id: "dealOnly", sellableAlone: false }),
        item({ id: "noPrice", price: null }),
        item({ id: "sizedOk", price: null, variants: [{ id: "v", label: "S", price: "10", sortOrder: 0, addOns: [] }] }),
        item({ id: "sizedUnpriced", price: null, variants: [{ id: "v", label: "S", price: null, sortOrder: 0, addOns: [] }] }),
      ],
    );
    const orderable = Object.fromEntries(items.map((entry) => [entry.id, entry.orderable]));
    expect(orderable).toEqual({ plain: true, dealOnly: false, noPrice: false, sizedOk: true, sizedUnpriced: false });
  });

  it("orders categories and items by sortOrder (then name), uncategorised last, and drops empty categories", () => {
    const categories = [
      category({ id: "b", name: "Bakery", sortOrder: 2 }),
      category({ id: "a", name: "Chai", sortOrder: 1 }),
      category({ id: "empty", name: "Unused", sortOrder: 0 }),
    ];
    const result = toPublicMenu(categories, [
      item({ id: "bakery", name: "Cake", categoryId: "b", sortOrder: 0 }),
      item({ id: "none", name: "Aaa", categoryId: null, sortOrder: 0 }),
      item({ id: "chai2", name: "Zeera", categoryId: "a", sortOrder: 1 }),
      item({ id: "chai1", name: "Zzz", categoryId: "a", sortOrder: 0 }),
    ]);
    expect(result.items.map((entry) => entry.id)).toEqual(["chai1", "chai2", "bakery", "none"]);
    expect(result.categories.map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("toPublicDeals", () => {
  it("never exposes internal columns", () => {
    const json = JSON.stringify(toPublicDeals([deal()]));
    expect(json).not.toContain(SECRET);
    expect(json).not.toMatch(/kitchenId|isAvailableInPOS|createdAt|isActive|dealId/);
  });

  it("omits inactive and not-online deals", () => {
    const result = toPublicDeals([deal({ id: "ok" }), deal({ id: "inactive", isActive: false }), deal({ id: "pos", isAvailableOnline: false })]);
    expect(result.map((entry) => entry.id)).toEqual(["ok"]);
  });

  it("shapes a deal with Urdu names, image and orderable", () => {
    const [result] = toPublicDeals([deal({ imageId: "img-9" })]);
    expect(result).toMatchObject({
      id: "deal-1",
      nameUr: "فیملی ڈیل",
      price: "999.00",
      code: "DEAL-01",
      image: {
        thumb: "/api/online/media/img-9?size=thumb",
        full: "/api/online/media/img-9?size=full",
        hasTransparency: false,
      },
      isFeatured: false,
      orderable: true,
    });
    expect(result!.items[0]).toEqual({
      id: "di-1",
      menuItemId: "item-1",
      quantity: 2,
      menuItem: { id: "item-1", name: "Doodh Patti", nameUr: null, price: "120.00" },
    });
  });

  it("is not orderable without fixed items (online orders only explode DealItems)", () => {
    expect(toPublicDeals([deal({ items: [] })])[0]!.orderable).toBe(false);
  });
});

const storeSource = (over: Record<string, unknown> = {}): SourceStore =>
  ({
    settings: {
      id: 1,
      shopNameEn: "Zoryx",
      shopNameUr: "ماٹکا چائے",
      taglineEn: "t",
      taglineUr: "ٹ",
      phone: "0300",
      whatsappNumber: "923001234567",
      addressEn: "a",
      addressUr: "ا",
      mapUrl: "https://maps.example",
      openingHoursEn: "h",
      openingHoursUr: "ح",
      announcementEn: null,
      announcementUr: null,
      onlineOrderingEnabled: true,
      deliveryEnabled: true,
      pickupEnabled: false,
      pickupMinOrderAmount: "300.00",
      pickupNoteEn: "Ready in about 20 minutes",
      pickupNoteUr: null,
      facebookUrl: null,
      instagramUrl: null,
      tiktokUrl: null,
      updatedAt: `${SECRET}-DATE`,
    },
    deliveryAreas: [
      { id: "d2", nameEn: "B", nameUr: "ب", deliveryFee: "100.00", minOrderAmount: "500.00", sortOrder: 2, isActive: true, createdAt: `${SECRET}-DATE` },
      { id: "d1", nameEn: "A", nameUr: "ا", deliveryFee: "50.00", minOrderAmount: "0.00", sortOrder: 1, isActive: true },
      { id: "dx", nameEn: "Off", nameUr: "x", deliveryFee: "0", minOrderAmount: "0", sortOrder: 0, isActive: false },
    ],
    paymentAccounts: [
      { id: "p1", label: "Easypaisa", accountTitle: "Zoryx", accountNumber: "0300-1", qrMediaId: "qr-1", sortOrder: 1, isActive: true, createdAt: `${SECRET}-DATE` },
      { id: "px", label: "Old", accountTitle: "x", accountNumber: "0", qrMediaId: null, sortOrder: 0, isActive: false },
    ],
    gallery: [
      { id: "g1", mediaId: "m1", captionEn: "c", captionUr: "ک", sortOrder: 1, isActive: true, createdAt: `${SECRET}-DATE` },
      { id: "gx", mediaId: "m2", captionEn: null, captionUr: null, sortOrder: 0, isActive: false },
    ],
    testimonials: [
      { id: "t1", name: "Ali", area: "DHA", text: "Great", textUr: "بہت اچھا", rating: 5, sortOrder: 1, isActive: true, createdAt: `${SECRET}-DATE` },
      { id: "tx", name: "Hidden", area: null, text: "x", textUr: null, rating: null, sortOrder: 0, isActive: false },
    ],
    hasActiveBusinessDay: true,
    ...over,
  }) as unknown as SourceStore;

describe("toPublicStore: ways to order", () => {
  it("exposes the switches, the pickup minimum (as a string) and the pickup note", () => {
    const { settings } = toPublicStore(storeSource());
    expect(settings).toMatchObject({
      deliveryEnabled: true,
      pickupEnabled: false,
      pickupMinOrderAmount: "300.00",
      pickupNoteEn: "Ready in about 20 minutes",
      pickupNoteUr: null,
    });
  });
});

describe("toPublicStore", () => {
  it("never exposes ids of settings, timestamps, inactive rows, or the raw switch", () => {
    const store = toPublicStore(storeSource());
    const json = JSON.stringify(store);
    expect(json).not.toContain(SECRET);
    expect(json).not.toMatch(/Hidden|"Off"|"Old"|updatedAt|createdAt|onlineOrderingEnabled|isActive|mediaId|qrMediaId/);
    expect(store.settings).not.toHaveProperty("id");
  });

  it("returns active rows in sortOrder, money as strings, and image/QR URLs", () => {
    const store = toPublicStore(storeSource());
    expect(store.deliveryAreas).toEqual([
      { id: "d1", nameEn: "A", nameUr: "ا", deliveryFee: "50.00", minOrderAmount: "0.00" },
      { id: "d2", nameEn: "B", nameUr: "ب", deliveryFee: "100.00", minOrderAmount: "500.00" },
    ]);
    expect(store.paymentAccounts).toEqual([
      { id: "p1", label: "Easypaisa", accountTitle: "Zoryx", accountNumber: "0300-1", qrUrl: "/api/online/media/qr-1?size=full" },
    ]);
    expect(store.gallery).toEqual([
      { id: "g1", captionEn: "c", captionUr: "ک", image: { thumb: "/api/online/media/m1?size=thumb", full: "/api/online/media/m1?size=full" } },
    ]);
    expect(store.testimonials).toEqual([
      { id: "t1", name: "Ali", area: "DHA", text: "Great", textUr: "بہت اچھا", rating: 5 },
    ]);
  });

  it("reports ordering open only when switched on AND a business day is active", () => {
    expect(toPublicStore(storeSource())).toMatchObject({ orderingOpen: true, closedReason: null });
    expect(toPublicStore(storeSource({ hasActiveBusinessDay: false }))).toMatchObject({
      orderingOpen: false,
      closedReason: "no_business_day",
    });
  });
});

describe("computeOrdering", () => {
  it("covers the full matrix, with switched_off taking precedence", () => {
    expect(computeOrdering(true, true)).toEqual({ orderingOpen: true, closedReason: null });
    expect(computeOrdering(true, false)).toEqual({ orderingOpen: false, closedReason: "no_business_day" });
    expect(computeOrdering(false, true)).toEqual({ orderingOpen: false, closedReason: "switched_off" });
    expect(computeOrdering(false, false)).toEqual({ orderingOpen: false, closedReason: "switched_off" });
  });
});
