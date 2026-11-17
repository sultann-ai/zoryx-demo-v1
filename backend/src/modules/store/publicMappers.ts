import { mediaUrls } from "../../common/media/mediaUrls";

// The whitelist layer for everything the public website can see. Each function builds its output
// field by field from rows the database returned — never by spreading a row — so a column added
// to a table later (a cost, a staff id, image bytes) can't leak to the internet by accident.
// Pure, no database: unit-tested by feeding rows seeded with sentinel secrets.

type MoneyLike = { toString(): string } | string | number;

const money = (value: MoneyLike | null | undefined): string | null =>
  value === null || value === undefined ? null : value.toString();

const image = (id: string | null) => (id ? mediaUrls(id) : null);

// A photo with its urls and whether it is a cut-out (transparent background): the website shows a
// cut-out "contained" on a plain surface instead of filling a card with it.
const photo = (id: string | null, asset: { hasTransparency: boolean } | null | undefined) =>
  id ? { ...mediaUrls(id), hasTransparency: asset?.hasTransparency ?? false } : null;

// A menu item counts as "new" for this long after it was created.
export const NEW_ITEM_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// ================= Menu =================

export interface SourceCategory {
  id: string;
  name: string;
  nameUr: string | null;
  sortOrder: number;
  imageId: string | null;
  image: { hasTransparency: boolean } | null;
}

export interface SourceVariant {
  id: string;
  label: string;
  price: MoneyLike | null;
  sortOrder: number;
  addOns: { id: string; name: string; price: MoneyLike }[];
}

export interface SourceMenuItem {
  id: string;
  name: string;
  nameUr: string | null;
  description: string | null;
  descriptionUr: string | null;
  price: MoneyLike | null;
  slug: string;
  categoryId: string | null;
  imageUrl: string | null;
  imageId: string | null;
  image: { hasTransparency: boolean } | null;
  isFeatured: boolean;
  sortOrder: number;
  createdAt: Date;
  sellableAlone: boolean;
  isAvailableOnline: boolean;
  isOpenPrice: boolean;
  variants: SourceVariant[];
}

export function toPublicMenu(categories: SourceCategory[], items: SourceMenuItem[], now: Date = new Date()) {
  // Defensive: the query already filters these, but the public shape must not depend on that.
  // Open-price items are never orderable online (a customer must never set their own price).
  const visible = items.filter((item) => item.isAvailableOnline && !item.isOpenPrice);

  const mappedItems = visible.map((item) => {
    // Only priced sizes are orderable (an unpriced size can't be chosen at order time).
    const variants = item.variants
      .filter((variant) => variant.price !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((variant) => ({
        id: variant.id,
        label: variant.label,
        price: money(variant.price),
        sortOrder: variant.sortOrder,
        addOns: variant.addOns.map((addOn) => ({ id: addOn.id, name: addOn.name, price: money(addOn.price) })),
      }));
    return {
      id: item.id,
      name: item.name,
      nameUr: item.nameUr,
      description: item.description,
      descriptionUr: item.descriptionUr,
      price: money(item.price),
      slug: item.slug,
      categoryId: item.categoryId,
      imageUrl: item.imageUrl,
      image: photo(item.imageId, item.image),
      isFeatured: item.isFeatured,
      // True for NEW_ITEM_DAYS after the item was created (a future date can't make it "new").
      isNew: now.getTime() - new Date(item.createdAt).getTime() < NEW_ITEM_DAYS * DAY_MS,
      sortOrder: item.sortOrder,
      // Can this be added to an order by itself? Deal-only items and half-configured items
      // (no price and no priced size) can't.
      orderable: item.sellableAlone && (item.price !== null || variants.length > 0),
      variants,
    };
  });

  const categoryOrder = new Map(categories.map((category) => [category.id, category.sortOrder]));
  mappedItems.sort((a, b) => {
    const categoryA = a.categoryId !== null ? categoryOrder.get(a.categoryId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    const categoryB = b.categoryId !== null ? categoryOrder.get(b.categoryId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    return categoryA - categoryB || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  });

  // Only categories that actually have something to show, in sortOrder.
  const usedCategoryIds = new Set(mappedItems.map((item) => item.categoryId));
  const mappedCategories = categories
    .filter((category) => usedCategoryIds.has(category.id))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((category) => ({
      id: category.id,
      name: category.name,
      nameUr: category.nameUr,
      sortOrder: category.sortOrder,
      // Optional; when null the website falls back to the first item's photo.
      image: photo(category.imageId, category.image),
    }));

  return { categories: mappedCategories, items: mappedItems };
}

// ================= Deals =================

export interface SourceDeal {
  id: string;
  name: string;
  nameUr: string | null;
  description: string | null;
  descriptionUr: string | null;
  price: MoneyLike;
  code: string;
  imageId: string | null;
  image: { hasTransparency: boolean } | null;
  isFeatured: boolean;
  isActive: boolean;
  isAvailableOnline: boolean;
  items: {
    id: string;
    menuItemId: string;
    quantity: number;
    menuItem: { id: string; name: string; nameUr: string | null; price: MoneyLike | null };
  }[];
}

export function toPublicDeals(deals: SourceDeal[]) {
  return deals
    .filter((deal) => deal.isActive && deal.isAvailableOnline)
    .map((deal) => ({
      id: deal.id,
      name: deal.name,
      nameUr: deal.nameUr,
      description: deal.description,
      descriptionUr: deal.descriptionUr,
      price: money(deal.price),
      code: deal.code,
      image: photo(deal.imageId, deal.image),
      isFeatured: deal.isFeatured,
      // Online orders explode a deal's fixed DealItems only, so a deal without any can't be ordered.
      orderable: deal.items.length > 0,
      items: deal.items.map((item) => ({
        id: item.id,
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        menuItem: {
          id: item.menuItem.id,
          name: item.menuItem.name,
          nameUr: item.menuItem.nameUr,
          price: money(item.menuItem.price),
        },
      })),
    }));
}

// ================= Store =================

export interface SourceStore {
  settings: {
    shopNameEn: string;
    shopNameUr: string;
    taglineEn: string;
    taglineUr: string;
    phone: string;
    whatsappNumber: string;
    addressEn: string;
    addressUr: string;
    mapUrl: string;
    openingHoursEn: string;
    openingHoursUr: string;
    announcementEn: string | null;
    announcementUr: string | null;
    onlineOrderingEnabled: boolean;
    deliveryEnabled: boolean;
    pickupEnabled: boolean;
    pickupMinOrderAmount: MoneyLike;
    pickupNoteEn: string | null;
    pickupNoteUr: string | null;
    facebookUrl: string | null;
    instagramUrl: string | null;
    tiktokUrl: string | null;
  };
  deliveryAreas: {
    id: string;
    nameEn: string;
    nameUr: string;
    deliveryFee: MoneyLike;
    minOrderAmount: MoneyLike;
    sortOrder: number;
    isActive: boolean;
  }[];
  paymentAccounts: {
    id: string;
    label: string;
    accountTitle: string;
    accountNumber: string;
    qrMediaId: string | null;
    sortOrder: number;
    isActive: boolean;
  }[];
  gallery: {
    id: string;
    mediaId: string;
    captionEn: string | null;
    captionUr: string | null;
    sortOrder: number;
    isActive: boolean;
  }[];
  testimonials: {
    id: string;
    name: string;
    area: string | null;
    text: string;
    textUr: string | null;
    rating: number | null;
    sortOrder: number;
    isActive: boolean;
  }[];
  hasActiveBusinessDay: boolean;
}

export type ClosedReason = "switched_off" | "no_business_day" | null;

// Open only when staff haven't switched online ordering off AND a business day is running
// (orders can't be created without one). "switched_off" wins when both apply.
export function computeOrdering(onlineOrderingEnabled: boolean, hasActiveBusinessDay: boolean) {
  const closedReason: ClosedReason = !onlineOrderingEnabled
    ? "switched_off"
    : !hasActiveBusinessDay
      ? "no_business_day"
      : null;
  return { orderingOpen: closedReason === null, closedReason };
}

const bySortOrder = <T extends { sortOrder: number }>(rows: T[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder);

export function toPublicStore(source: SourceStore) {
  const { settings } = source;
  return {
    settings: {
      shopNameEn: settings.shopNameEn,
      shopNameUr: settings.shopNameUr,
      taglineEn: settings.taglineEn,
      taglineUr: settings.taglineUr,
      phone: settings.phone,
      whatsappNumber: settings.whatsappNumber,
      addressEn: settings.addressEn,
      addressUr: settings.addressUr,
      mapUrl: settings.mapUrl,
      openingHoursEn: settings.openingHoursEn,
      openingHoursUr: settings.openingHoursUr,
      announcementEn: settings.announcementEn,
      announcementUr: settings.announcementUr,
      // Ways to order: the website shows only the enabled ones. Pickup is a TAKEAWAY order with no address.
      deliveryEnabled: settings.deliveryEnabled,
      pickupEnabled: settings.pickupEnabled,
      pickupMinOrderAmount: money(settings.pickupMinOrderAmount),
      pickupNoteEn: settings.pickupNoteEn,
      pickupNoteUr: settings.pickupNoteUr,
      facebookUrl: settings.facebookUrl,
      instagramUrl: settings.instagramUrl,
      tiktokUrl: settings.tiktokUrl,
    },
    deliveryAreas: bySortOrder(source.deliveryAreas.filter((area) => area.isActive)).map((area) => ({
      id: area.id,
      nameEn: area.nameEn,
      nameUr: area.nameUr,
      deliveryFee: money(area.deliveryFee),
      minOrderAmount: money(area.minOrderAmount),
    })),
    paymentAccounts: bySortOrder(source.paymentAccounts.filter((account) => account.isActive)).map((account) => ({
      id: account.id,
      label: account.label,
      accountTitle: account.accountTitle,
      accountNumber: account.accountNumber,
      qrUrl: account.qrMediaId ? mediaUrls(account.qrMediaId).full : null,
    })),
    gallery: bySortOrder(source.gallery.filter((entry) => entry.isActive)).map((entry) => ({
      id: entry.id,
      captionEn: entry.captionEn,
      captionUr: entry.captionUr,
      image: mediaUrls(entry.mediaId),
    })),
    testimonials: bySortOrder(source.testimonials.filter((entry) => entry.isActive)).map((entry) => ({
      id: entry.id,
      name: entry.name,
      area: entry.area,
      text: entry.text,
      textUr: entry.textUr,
      rating: entry.rating,
    })),
    ...computeOrdering(settings.onlineOrderingEnabled, source.hasActiveBusinessDay),
  };
}
