import { describe, expect, it } from "vitest";
import {
  parseCategoryContentUpdate,
  parseDealContentUpdate,
  parseDeliveryAreaCreate,
  parseDeliveryAreaUpdate,
  parseGalleryCreate,
  parseMenuItemContentUpdate,
  parsePaymentAccountCreate,
  parseSiteSettingsUpdate,
  parseTestimonialCreate,
} from "./siteContent.validators";

const errorOf = (result: { ok: boolean; error?: string }) => (result.ok ? null : result.error);

describe("site settings", () => {
  it("accepts a valid partial update and trims text", () => {
    const result = parseSiteSettingsUpdate({ shopNameEn: "  Zoryx ", whatsappNumber: "923001234567", onlineOrderingEnabled: false });
    expect(result).toEqual({
      ok: true,
      value: { shopNameEn: "Zoryx", whatsappNumber: "923001234567", onlineOrderingEnabled: false },
    });
  });

  it("accepts the pickup / delivery switches, the pickup minimum and the pickup note", () => {
    const result = parseSiteSettingsUpdate({
      deliveryEnabled: false,
      pickupEnabled: true,
      pickupMinOrderAmount: "250.50",
      pickupNoteEn: " Ready in about 20 minutes ",
      pickupNoteUr: null,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ deliveryEnabled: false, pickupEnabled: true, pickupNoteEn: "Ready in about 20 minutes", pickupNoteUr: null });
    expect(String(result.value.pickupMinOrderAmount)).toBe("250.5");
  });

  it("rejects bad pickup fields", () => {
    expect(errorOf(parseSiteSettingsUpdate({ pickupEnabled: "yes" }))).toContain("boolean");
    expect(errorOf(parseSiteSettingsUpdate({ deliveryEnabled: 1 }))).toContain("boolean");
    expect(errorOf(parseSiteSettingsUpdate({ pickupMinOrderAmount: -5 }))).toContain("pickupMinOrderAmount");
    expect(errorOf(parseSiteSettingsUpdate({ pickupMinOrderAmount: "1.005" }))).toContain("decimal");
    expect(errorOf(parseSiteSettingsUpdate({ pickupNoteEn: "n".repeat(201) }))).toContain("pickupNoteEn");
  });

  it("validates the WhatsApp number as international digits", () => {
    for (const bad of ["+923001234567", "03001234567", "92 300 1234567", "12345", "abc", 923001234567]) {
      expect(errorOf(parseSiteSettingsUpdate({ whatsappNumber: bad }))).toContain("whatsappNumber");
    }
  });

  it("only allows http(s) URLs (no javascript:/data: links on the public site)", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "ftp://x.test", "not a url", ""]) {
      expect(errorOf(parseSiteSettingsUpdate({ mapUrl: bad }))).toContain("mapUrl");
    }
    expect(parseSiteSettingsUpdate({ mapUrl: "https://maps.app.goo.gl/abc" }).ok).toBe(true);
    expect(errorOf(parseSiteSettingsUpdate({ facebookUrl: "javascript:alert(1)" }))).toContain("facebookUrl");
  });

  it("lets optional fields be cleared with null or an empty string", () => {
    expect(parseSiteSettingsUpdate({ announcementEn: null, facebookUrl: "", announcementUr: "   " })).toEqual({
      ok: true,
      value: { announcementEn: null, facebookUrl: null, announcementUr: null },
    });
  });

  it("rejects unknown keys and non-boolean switches", () => {
    expect(errorOf(parseSiteSettingsUpdate({ id: 2 }))).toContain("id is not an editable field");
    expect(errorOf(parseSiteSettingsUpdate({ onlineOrderingEnabled: "yes" }))).toContain("boolean");
  });
});

describe("delivery areas", () => {
  it("requires both names and defaults fees at the database", () => {
    expect(errorOf(parseDeliveryAreaCreate({ nameEn: "DHA" }))).toBe("nameUr is required");
    expect(parseDeliveryAreaCreate({ nameEn: "DHA", nameUr: "ڈی ایچ اے" })).toEqual({
      ok: true,
      value: { nameEn: "DHA", nameUr: "ڈی ایچ اے" },
    });
  });

  it("accepts money as string or number with up to 2 decimals, rejects negatives and junk", () => {
    expect(parseDeliveryAreaUpdate({ deliveryFee: "150.50", minOrderAmount: 800 }).ok).toBe(true);
    for (const bad of [-1, "-5", "abc", "10.999", NaN, null, {}]) {
      expect(parseDeliveryAreaUpdate({ deliveryFee: bad }).ok).toBe(false);
    }
  });
});

describe("payment accounts, gallery, testimonials", () => {
  it("requires label, title and number; allows a null QR", () => {
    expect(errorOf(parsePaymentAccountCreate({ label: "Easypaisa" }))).toBe("accountTitle is required");
    expect(
      parsePaymentAccountCreate({ label: "Easypaisa", accountTitle: "Zoryx", accountNumber: "0300", qrMediaId: null }).ok,
    ).toBe(true);
  });

  it("requires a media id for a gallery image", () => {
    expect(errorOf(parseGalleryCreate({}))).toBe("mediaId is required");
    expect(errorOf(parseGalleryCreate({ mediaId: 5 }))).toContain("mediaId");
    expect(parseGalleryCreate({ mediaId: "abc", captionEn: "Inside" }).ok).toBe(true);
  });

  it("limits testimonial rating to 1-5 (or null)", () => {
    const base = { name: "Ali", text: "Great" };
    for (const good of [1, 3, 5, null]) expect(parseTestimonialCreate({ ...base, rating: good }).ok).toBe(true);
    for (const bad of [0, 6, 2.5, "5"]) expect(errorOf(parseTestimonialCreate({ ...base, rating: bad }))).toContain("rating");
  });
});

describe("online-content bodies (the endpoints ONLINE_ADMIN may use)", () => {
  it("accepts only website fields for a menu item and rejects prices/kitchens loudly", () => {
    expect(
      parseMenuItemContentUpdate({ nameUr: "چائے", descriptionUr: null, isFeatured: true, isAvailableOnline: false, sortOrder: 3, imageId: null }).ok,
    ).toBe(true);
    for (const forbidden of ["price", "kitchenId", "minPrice", "maxPrice", "name", "isOpenPrice", "categoryId", "isAvailableInPOS"]) {
      expect(errorOf(parseMenuItemContentUpdate({ [forbidden]: 1 }))).toContain(`${forbidden} is not an editable field`);
    }
  });

  it("limits categories to nameUr/sortOrder and deals to image/Urdu text (never price)", () => {
    expect(parseCategoryContentUpdate({ nameUr: "چائے", sortOrder: 2 }).ok).toBe(true);
    expect(errorOf(parseCategoryContentUpdate({ name: "x" }))).toContain("name is not an editable field");
    expect(parseDealContentUpdate({ imageId: "abc", nameUr: "ڈیل" }).ok).toBe(true);
    // A deal's "Show online" switch is a website field, like a menu item's.
    expect(parseDealContentUpdate({ isAvailableOnline: false }).ok).toBe(true);
    expect(parseDealContentUpdate({ isFeatured: true }).ok).toBe(true);
    expect(errorOf(parseDealContentUpdate({ isFeatured: "yes" }))).toContain("boolean");
    expect(parseCategoryContentUpdate({ imageId: "abc" }).ok).toBe(true);
    expect(parseCategoryContentUpdate({ imageId: null }).ok).toBe(true);
    expect(errorOf(parseCategoryContentUpdate({ imageId: "" }))).toContain("media asset id");
    expect(errorOf(parseDealContentUpdate({ isAvailableOnline: "yes" }))).toContain("boolean");
    expect(errorOf(parseDealContentUpdate({ price: 1 }))).toContain("price is not an editable field");
  });

  it("validates sortOrder and text lengths", () => {
    expect(errorOf(parseCategoryContentUpdate({ sortOrder: -1 }))).toContain("sortOrder");
    expect(errorOf(parseCategoryContentUpdate({ sortOrder: 1.5 }))).toContain("sortOrder");
    expect(errorOf(parseCategoryContentUpdate({ nameUr: "x".repeat(121) }))).toContain("at most 120");
  });
});
