import {
  findDisallowedKey,
  Parsed,
  parseBoolean,
  parseHttpUrl,
  parseMoney,
  parseNullableHttpUrl,
  parseNullableText,
  parseRequiredText,
  parseSortOrder,
  parseWhatsappNumber,
} from "../../common/validation";

// Pure request-body parsing for the website-content endpoints (no database), so it's unit-tested
// directly. Every parser rejects keys it doesn't know — a typo or a field a role may not set is a
// loud 400, never silently ignored.

type FieldParser = (value: unknown) => Parsed<unknown>;
type FieldSpecs = Record<string, FieldParser>;

function parseFields(
  body: Record<string, unknown>,
  specs: FieldSpecs,
  required: readonly string[],
): Parsed<Record<string, unknown>> {
  const allowed = Object.keys(specs);
  const unknownKey = findDisallowedKey(body, allowed);
  if (unknownKey !== null) {
    return { ok: false, error: `${unknownKey} is not an editable field (allowed: ${allowed.join(", ")})` };
  }
  const missing = required.find((key) => body[key] === undefined);
  if (missing !== undefined) {
    return { ok: false, error: `${missing} is required` };
  }
  const out: Record<string, unknown> = {};
  for (const [key, parser] of Object.entries(specs)) {
    if (body[key] === undefined) {
      continue;
    }
    const parsed = parser(body[key]);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    out[key] = parsed.value;
  }
  return { ok: true, value: out };
}

const text = (field: string, max: number): FieldParser => (value) => parseRequiredText(field, value, max);
const nullableText = (field: string, max: number): FieldParser => (value) => parseNullableText(field, value, max);
const bool = (field: string): FieldParser => (value) => parseBoolean(field, value);
const money = (field: string): FieldParser => (value) => parseMoney(field, value);
// A percentage 0-100 with at most 2 decimal places.
const percent = (field: string): FieldParser => (value) => {
  const parsed = parseMoney(field, value);
  if (parsed.ok && parsed.value.greaterThan(100)) {
    return { ok: false, error: `${field} must be between 0 and 100` };
  }
  return parsed;
};
const sortOrder: FieldParser = (value) => parseSortOrder(value);

const PHONE_PATTERN = /^[0-9+()\-\s]{5,30}$/;
const phone: FieldParser = (value) => {
  if (typeof value !== "string" || !PHONE_PATTERN.test(value.trim())) {
    return { ok: false, error: "phone must be 5-30 characters: digits, spaces, + ( ) -" };
  }
  return { ok: true, value: value.trim() };
};

// ---------- SiteSettings ----------

const SITE_SETTINGS_SPECS: FieldSpecs = {
  shopNameEn: text("shopNameEn", 80),
  shopNameUr: text("shopNameUr", 80),
  taglineEn: text("taglineEn", 160),
  taglineUr: text("taglineUr", 160),
  phone,
  whatsappNumber: (value) => parseWhatsappNumber(value),
  addressEn: text("addressEn", 300),
  addressUr: text("addressUr", 300),
  mapUrl: (value) => parseHttpUrl("mapUrl", value),
  openingHoursEn: text("openingHoursEn", 300),
  openingHoursUr: text("openingHoursUr", 300),
  announcementEn: nullableText("announcementEn", 500),
  announcementUr: nullableText("announcementUr", 500),
  onlineOrderingEnabled: bool("onlineOrderingEnabled"),
  // Which ways to order are offered online; the service refuses to switch both off.
  deliveryEnabled: bool("deliveryEnabled"),
  pickupEnabled: bool("pickupEnabled"),
  pickupMinOrderAmount: money("pickupMinOrderAmount"),
  pickupNoteEn: nullableText("pickupNoteEn", 200),
  pickupNoteUr: nullableText("pickupNoteUr", 200),
  facebookUrl: (value) => parseNullableHttpUrl("facebookUrl", value),
  instagramUrl: (value) => parseNullableHttpUrl("instagramUrl", value),
  tiktokUrl: (value) => parseNullableHttpUrl("tiktokUrl", value),
  // Only a SUPER_ADMIN may change it (checked in the controller).
  maxDiscountPercentPosAdmin: percent("maxDiscountPercentPosAdmin"),
};

export function parseSiteSettingsUpdate(body: Record<string, unknown>) {
  return parseFields(body, SITE_SETTINGS_SPECS, []);
}

// ---------- DeliveryArea ----------

const DELIVERY_AREA_SPECS: FieldSpecs = {
  nameEn: text("nameEn", 80),
  nameUr: text("nameUr", 80),
  deliveryFee: money("deliveryFee"),
  minOrderAmount: money("minOrderAmount"),
  sortOrder,
  isActive: bool("isActive"),
};
export const parseDeliveryAreaCreate = (body: Record<string, unknown>) =>
  parseFields(body, DELIVERY_AREA_SPECS, ["nameEn", "nameUr"]);
export const parseDeliveryAreaUpdate = (body: Record<string, unknown>) => parseFields(body, DELIVERY_AREA_SPECS, []);

// ---------- PaymentAccount ----------

const mediaId =
  (field: string): FieldParser =>
  (value) =>
    typeof value === "string" && value.length > 0 && value.length <= 64
      ? { ok: true, value }
      : { ok: false, error: `${field} must be a media asset id` };

const PAYMENT_ACCOUNT_SPECS: FieldSpecs = {
  label: text("label", 60),
  accountTitle: text("accountTitle", 100),
  accountNumber: text("accountNumber", 60),
  qrMediaId: (value) => (value === null ? { ok: true, value: null } : mediaId("qrMediaId")(value)),
  sortOrder,
  isActive: bool("isActive"),
};
export const parsePaymentAccountCreate = (body: Record<string, unknown>) =>
  parseFields(body, PAYMENT_ACCOUNT_SPECS, ["label", "accountTitle", "accountNumber"]);
export const parsePaymentAccountUpdate = (body: Record<string, unknown>) =>
  parseFields(body, PAYMENT_ACCOUNT_SPECS, []);

// ---------- GalleryImage ----------

const GALLERY_SPECS: FieldSpecs = {
  mediaId: mediaId("mediaId"),
  captionEn: nullableText("captionEn", 200),
  captionUr: nullableText("captionUr", 200),
  sortOrder,
  isActive: bool("isActive"),
};
export const parseGalleryCreate = (body: Record<string, unknown>) => parseFields(body, GALLERY_SPECS, ["mediaId"]);
export const parseGalleryUpdate = (body: Record<string, unknown>) => parseFields(body, GALLERY_SPECS, []);

// ---------- Testimonial ----------

const rating: FieldParser = (value) => {
  if (value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    return { ok: false, error: "rating must be an integer from 1 to 5, or null" };
  }
  return { ok: true, value };
};

const TESTIMONIAL_SPECS: FieldSpecs = {
  name: text("name", 80),
  area: nullableText("area", 80),
  text: text("text", 600),
  textUr: nullableText("textUr", 600),
  rating,
  sortOrder,
  isActive: bool("isActive"),
};
export const parseTestimonialCreate = (body: Record<string, unknown>) =>
  parseFields(body, TESTIMONIAL_SPECS, ["name", "text"]);
export const parseTestimonialUpdate = (body: Record<string, unknown>) => parseFields(body, TESTIMONIAL_SPECS, []);

// ---------- Online-content PATCH bodies (menu item / category / deal) ----------

// The only fields these endpoints accept. Sent by ONLINE_ADMIN too, which is why a price,
// kitchen, or anything else is rejected rather than ignored.
const MENU_ITEM_CONTENT_SPECS: FieldSpecs = {
  imageId: (value) => (value === null ? { ok: true, value: null } : mediaId("imageId")(value)),
  nameUr: nullableText("nameUr", 120),
  descriptionUr: nullableText("descriptionUr", 600),
  isFeatured: bool("isFeatured"),
  isAvailableOnline: bool("isAvailableOnline"),
  sortOrder,
};
const CATEGORY_CONTENT_SPECS: FieldSpecs = {
  imageId: MENU_ITEM_CONTENT_SPECS.imageId as FieldParser,
  nameUr: nullableText("nameUr", 120),
  sortOrder,
};
const DEAL_CONTENT_SPECS: FieldSpecs = {
  imageId: MENU_ITEM_CONTENT_SPECS.imageId as FieldParser,
  nameUr: nullableText("nameUr", 120),
  descriptionUr: nullableText("descriptionUr", 600),
  // The "Popular" star, like a menu item's isFeatured.
  isFeatured: bool("isFeatured"),
  // Like a menu item's: whether the website shows it. (Not a price, so ONLINE_ADMIN may set it.)
  isAvailableOnline: bool("isAvailableOnline"),
};
export const parseMenuItemContentUpdate = (body: Record<string, unknown>) =>
  parseFields(body, MENU_ITEM_CONTENT_SPECS, []);
export const parseCategoryContentUpdate = (body: Record<string, unknown>) =>
  parseFields(body, CATEGORY_CONTENT_SPECS, []);
export const parseDealContentUpdate = (body: Record<string, unknown>) => parseFields(body, DEAL_CONTENT_SPECS, []);
