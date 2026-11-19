import { MediaKind, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { uniqueSlug } from "../../common/slug";
import { assertAttachable, releaseMediaIfUnreferenced } from "../media/media.service";
import { RecordNotFoundError } from "../siteContent/siteContent.errors";

// A sized item has price: null here — real prices live on MenuItemVariant instead
// (see createMenuItemVariant etc. below).
const variantsInclude = {
  variants: { orderBy: { sortOrder: "asc" } },
} satisfies Prisma.MenuItemInclude;

type MenuItemWithVariants = Prisma.MenuItemGetPayload<{ include: typeof variantsInclude }>;

// Add-ons are scoped to one category and priced per size label (see AddOn's schema
// comment) — a variant's available add-ons are whichever add-ons share its item's
// category and have a price for that variant's label.
async function attachAddOns<T extends MenuItemWithVariants>(items: T[]) {
  const addOns = await prisma.addOn.findMany({ include: { prices: true } });
  const addOnsByCategoryId = new Map<string, typeof addOns>();
  for (const addOn of addOns) {
    if (addOn.categoryId === null) {
      continue;
    }
    const bucket = addOnsByCategoryId.get(addOn.categoryId);
    if (bucket) {
      bucket.push(addOn);
    } else {
      addOnsByCategoryId.set(addOn.categoryId, [addOn]);
    }
  }

  return items.map((item) => ({
    ...item,
    variants: item.variants.map((variant) => {
      const candidates = item.categoryId !== null ? addOnsByCategoryId.get(item.categoryId) ?? [] : [];
      const variantAddOns = candidates.flatMap((addOn) => {
        const priceRow = addOn.prices.find((p) => p.size === variant.label);
        return priceRow ? [{ id: addOn.id, name: addOn.name, price: priceRow.price }] : [];
      });
      return { ...variant, addOns: variantAddOns };
    }),
  }));
}

export interface CreateMenuItemInput {
  name: string;
  description?: string;
  // Omit (or pass null) for a sized item — add its sizes via the variant endpoints after creating it.
  price?: Prisma.Decimal | null;
  kitchenId: string;
  categoryId?: string;
  imageUrl?: string;
  isAvailableInPOS?: boolean;
  isAvailableOnline?: boolean;
  isAvailableOnQr?: boolean;
  isOpenPrice?: boolean;
  minPrice?: Prisma.Decimal | null;
  maxPrice?: Prisma.Decimal | null;
}

export interface UpdateMenuItemInput {
  name?: string;
  description?: string | null;
  // Explicit null converts an item to sized (no standalone price); undefined leaves it unchanged.
  price?: Prisma.Decimal | null;
  kitchenId?: string;
  categoryId?: string | null;
  imageUrl?: string | null;
  isAvailableInPOS?: boolean;
  isAvailableOnline?: boolean;
  isAvailableOnQr?: boolean;
  isOpenPrice?: boolean;
  minPrice?: Prisma.Decimal | null;
  maxPrice?: Prisma.Decimal | null;
}

export async function listMenuItems(kitchenId?: string) {
  const items = await prisma.menuItem.findMany({
    ...(kitchenId !== undefined ? { where: { kitchenId } } : {}),
    include: variantsInclude,
    orderBy: { name: "asc" },
  });
  return attachAddOns(items);
}

export async function listOnlineMenuItems() {
  // Open-price items are never orderable online — a customer must never set their own
  // price (see order.service.ts's parseItemFields allowUnitPrice gate for the matching
  // order-time enforcement).
  const items = await prisma.menuItem.findMany({
    where: { isAvailableOnline: true, isOpenPrice: false },
    include: { ...variantsInclude, image: { select: { hasTransparency: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return attachAddOns(items);
}

// The Table QR menu: its own flag, independent of the website's. Open-price items never (a guest
// must never set their own price); the order route enforces the same rule (qrOnly).
export async function listQrMenuItems() {
  const items = await prisma.menuItem.findMany({
    where: { isAvailableOnQr: true, isOpenPrice: false },
    include: { ...variantsInclude, image: { select: { hasTransparency: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return attachAddOns(items);
}

export function setQrAvailability(id: string, isAvailableOnQr: boolean) {
  return prisma.menuItem.update({ where: { id }, data: { isAvailableOnQr } });
}

export function listOnlineCategories() {
  return prisma.category.findMany({
    include: { image: { select: { hasTransparency: true } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

// The customer-website fields of a menu item (photo, Urdu text, featured flag, online
// availability, display order). Deliberately a separate, narrow write so that ONLINE_ADMIN can use
// it without ever being able to touch a price or kitchen. Replacing the photo deletes the old
// asset in the same transaction.
export function updateMenuItemOnlineContent(id: string, data: Record<string, unknown>) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.menuItem.findUnique({ where: { id }, select: { imageId: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    if (typeof data.imageId === "string" && data.imageId !== current.imageId) {
      await assertAttachable(tx, data.imageId, MediaKind.MENU_ITEM);
    }
    const updated = await tx.menuItem.update({ where: { id }, data: data as Prisma.MenuItemUncheckedUpdateInput });
    if (data.imageId !== undefined && current.imageId !== updated.imageId) {
      await releaseMediaIfUnreferenced(tx, current.imageId);
    }
    return updated;
  });
}

// Lean lookup for the open-price combination checks in the controller (price, current
// flags, and whether any size already exists) — avoids the heavier add-ons join that
// getMenuItemById does for a response body.
export function getMenuItemCoreById(id: string) {
  return prisma.menuItem.findUnique({
    where: { id },
    select: {
      id: true,
      price: true,
      isOpenPrice: true,
      minPrice: true,
      maxPrice: true,
      variants: { select: { id: true } },
    },
  });
}

export async function getMenuItemById(id: string) {
  const item = await prisma.menuItem.findUnique({ where: { id }, include: variantsInclude });
  if (!item) {
    return null;
  }
  const [withAddOns] = await attachAddOns([item]);
  return withAddOns;
}

export function kitchenExists(id: string) {
  return prisma.kitchen.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

export function categoryExists(id: string) {
  return prisma.category.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

export async function createMenuItem(data: CreateMenuItemInput) {
  const slug = await uniqueSlug(data.name, async (candidate) => {
    const existing = await prisma.menuItem.findUnique({ where: { slug: candidate }, select: { id: true } });
    return existing !== null;
  });

  return prisma.menuItem.create({
    data: {
      name: data.name,
      slug,
      kitchenId: data.kitchenId,
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      ...(data.isAvailableInPOS !== undefined ? { isAvailableInPOS: data.isAvailableInPOS } : {}),
      ...(data.isAvailableOnline !== undefined ? { isAvailableOnline: data.isAvailableOnline } : {}),
      ...(data.isAvailableOnQr !== undefined ? { isAvailableOnQr: data.isAvailableOnQr } : {}),
      ...(data.isOpenPrice !== undefined ? { isOpenPrice: data.isOpenPrice } : {}),
      ...(data.minPrice !== undefined ? { minPrice: data.minPrice } : {}),
      ...(data.maxPrice !== undefined ? { maxPrice: data.maxPrice } : {}),
    },
  });
}

export function updateMenuItem(id: string, data: UpdateMenuItemInput) {
  return prisma.menuItem.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.kitchenId !== undefined ? { kitchenId: data.kitchenId } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      ...(data.isAvailableInPOS !== undefined ? { isAvailableInPOS: data.isAvailableInPOS } : {}),
      ...(data.isAvailableOnline !== undefined ? { isAvailableOnline: data.isAvailableOnline } : {}),
      ...(data.isAvailableOnQr !== undefined ? { isAvailableOnQr: data.isAvailableOnQr } : {}),
      ...(data.isOpenPrice !== undefined ? { isOpenPrice: data.isOpenPrice } : {}),
      ...(data.minPrice !== undefined ? { minPrice: data.minPrice } : {}),
      ...(data.maxPrice !== undefined ? { maxPrice: data.maxPrice } : {}),
    },
  });
}

export function setOnlineAvailability(id: string, isAvailableOnline: boolean) {
  return prisma.menuItem.update({
    where: { id },
    data: { isAvailableOnline },
  });
}

export function deleteMenuItem(id: string) {
  return prisma.menuItem.delete({ where: { id } });
}

// ================= Variants (sizes) =================

export interface CreateVariantInput {
  label: string;
  price?: Prisma.Decimal | null;
  sortOrder?: number;
}

export interface UpdateVariantInput {
  label?: string;
  price?: Prisma.Decimal | null;
  sortOrder?: number;
}

export function menuItemExists(id: string) {
  return prisma.menuItem.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

// Used by createVariant/updateVariant to reject adding a size to an open-price item
// (mutually exclusive — see MenuItem.isOpenPrice's schema comment).
export function getMenuItemOpenPriceFlag(id: string) {
  return prisma.menuItem.findUnique({ where: { id }, select: { id: true, isOpenPrice: true } });
}

export function getVariantById(menuItemId: string, variantId: string) {
  return prisma.menuItemVariant.findFirst({ where: { id: variantId, menuItemId } });
}

export function createVariant(menuItemId: string, data: CreateVariantInput) {
  return prisma.menuItemVariant.create({
    data: {
      menuItemId,
      label: data.label,
      price: data.price ?? null,
      sortOrder: data.sortOrder ?? 0,
    },
  });
}

export function updateVariant(variantId: string, data: UpdateVariantInput) {
  return prisma.menuItemVariant.update({
    where: { id: variantId },
    data: {
      ...(data.label !== undefined ? { label: data.label } : {}),
      ...(data.price !== undefined ? { price: data.price } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
  });
}

export function deleteVariant(variantId: string) {
  return prisma.menuItemVariant.delete({ where: { id: variantId } });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
