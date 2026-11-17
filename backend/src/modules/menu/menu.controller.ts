import { Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client";
import { mediaUrls } from "../../common/media/mediaUrls";
import { respondToSiteContentError } from "../siteContent/siteContent.errors";
import { parseMenuItemContentUpdate } from "../siteContent/siteContent.validators";
import { toPublicMenu } from "../store/publicMappers";
import * as menuService from "./menu.service";

export async function listMenuItems(req: Request, res: Response) {
  const { kitchenId } = req.query;

  if (kitchenId !== undefined && typeof kitchenId !== "string") {
    res.status(400).json({ error: "kitchenId must be a single string value" });
    return;
  }

  const menuItems = await menuService.listMenuItems(kitchenId);
  res.json(menuItems);
}

// Public. Shaped by toPublicMenu (an explicit whitelist), never the raw rows. Cached for a
// minute on success only.
export async function listOnlineMenuItems(_req: Request, res: Response) {
  const [categories, menuItems] = await Promise.all([
    menuService.listOnlineCategories(),
    menuService.listOnlineMenuItems(),
  ]);
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(toPublicMenu(categories, menuItems));
}

export async function getMenuItem(req: Request, res: Response) {
  const menuItem = await menuService.getMenuItemById(req.params.id as string);
  if (!menuItem) {
    res.status(404).json({ error: "Menu item not found" });
    return;
  }
  res.json(menuItem);
}

export async function createMenuItem(req: Request, res: Response) {
  const {
    name,
    description,
    price,
    kitchenId,
    categoryId,
    imageUrl,
    isAvailableInPOS,
    isAvailableOnline,
    isOpenPrice,
    minPrice,
    maxPrice,
  } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (description !== undefined && typeof description !== "string") {
    res.status(400).json({ error: "description must be a string" });
    return;
  }
  if (typeof kitchenId !== "string" || kitchenId.trim().length === 0) {
    res.status(400).json({ error: "kitchenId is required" });
    return;
  }
  if (categoryId !== undefined && typeof categoryId !== "string") {
    res.status(400).json({ error: "categoryId must be a string" });
    return;
  }
  if (imageUrl !== undefined && typeof imageUrl !== "string") {
    res.status(400).json({ error: "imageUrl must be a string" });
    return;
  }
  if (isAvailableInPOS !== undefined && typeof isAvailableInPOS !== "boolean") {
    res.status(400).json({ error: "isAvailableInPOS must be a boolean" });
    return;
  }
  if (isAvailableOnline !== undefined && typeof isAvailableOnline !== "boolean") {
    res.status(400).json({ error: "isAvailableOnline must be a boolean" });
    return;
  }
  if (isOpenPrice !== undefined && typeof isOpenPrice !== "boolean") {
    res.status(400).json({ error: "isOpenPrice must be a boolean" });
    return;
  }

  // Omitted or null: a sized item with no standalone price — real prices get added via
  // POST /:id/variants after this create. Anything else must be a valid non-negative decimal.
  let priceDecimal: Prisma.Decimal | null | undefined;
  if (price === undefined) {
    priceDecimal = undefined;
  } else if (price === null) {
    priceDecimal = null;
  } else if (typeof price === "string" || typeof price === "number") {
    try {
      priceDecimal = new Prisma.Decimal(price);
    } catch {
      res.status(400).json({ error: "price must be a valid decimal number" });
      return;
    }
    if (priceDecimal.isNaN() || priceDecimal.isNegative()) {
      res.status(400).json({ error: "price must be a non-negative number" });
      return;
    }
  } else {
    res.status(400).json({ error: "price must be a number, null, or omitted" });
    return;
  }

  let minPriceDecimal: Prisma.Decimal | null | undefined;
  if (minPrice !== undefined) {
    const parsed = parseNullablePrice(minPrice);
    if (!parsed.ok) {
      res.status(400).json({ error: `minPrice: ${parsed.error}` });
      return;
    }
    minPriceDecimal = parsed.value;
  }
  let maxPriceDecimal: Prisma.Decimal | null | undefined;
  if (maxPrice !== undefined) {
    const parsed = parseNullablePrice(maxPrice);
    if (!parsed.ok) {
      res.status(400).json({ error: `maxPrice: ${parsed.error}` });
      return;
    }
    maxPriceDecimal = parsed.value;
  }
  if (
    minPriceDecimal !== undefined &&
    minPriceDecimal !== null &&
    maxPriceDecimal !== undefined &&
    maxPriceDecimal !== null &&
    minPriceDecimal.greaterThan(maxPriceDecimal)
  ) {
    res.status(400).json({ error: "minPrice must be less than or equal to maxPrice" });
    return;
  }

  // An open-price item has no fixed price of its own (the cashier types one at order
  // time) — sizes/add-ons are blocked separately, at the variant endpoints (see
  // createVariant) since a brand-new item can't have any yet.
  if (isOpenPrice === true && priceDecimal !== undefined && priceDecimal !== null) {
    res.status(400).json({ error: "an open-price item cannot also have a fixed price" });
    return;
  }
  if (isOpenPrice !== true && (minPriceDecimal !== undefined || maxPriceDecimal !== undefined)) {
    res.status(400).json({ error: "minPrice/maxPrice only apply to an open-price item" });
    return;
  }

  const kitchenFound = await menuService.kitchenExists(kitchenId);
  if (!kitchenFound) {
    res.status(400).json({ error: "kitchenId does not reference an existing Kitchen" });
    return;
  }

  if (categoryId !== undefined) {
    const categoryFound = await menuService.categoryExists(categoryId);
    if (!categoryFound) {
      res.status(400).json({ error: "categoryId does not reference an existing Category" });
      return;
    }
  }

  try {
    const menuItem = await menuService.createMenuItem({
      name: name.trim(),
      kitchenId,
      ...(priceDecimal !== undefined ? { price: priceDecimal } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(isAvailableInPOS !== undefined ? { isAvailableInPOS } : {}),
      ...(isAvailableOnline !== undefined ? { isAvailableOnline } : {}),
      ...(isOpenPrice !== undefined ? { isOpenPrice } : {}),
      ...(minPriceDecimal !== undefined ? { minPrice: minPriceDecimal } : {}),
      ...(maxPriceDecimal !== undefined ? { maxPrice: maxPriceDecimal } : {}),
    });
    res.status(201).json(menuItem);
  } catch (error) {
    if (menuService.isForeignKeyConstraintError(error)) {
      res.status(400).json({ error: "kitchenId or categoryId does not reference an existing record" });
      return;
    }
    throw error;
  }
}

export async function updateMenuItem(req: Request, res: Response) {
  const {
    name,
    description,
    price,
    kitchenId,
    categoryId,
    imageUrl,
    isAvailableInPOS,
    isAvailableOnline,
    isOpenPrice,
    minPrice,
    maxPrice,
  } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    res.status(400).json({ error: "description must be a string or null" });
    return;
  }
  if (kitchenId !== undefined && (typeof kitchenId !== "string" || kitchenId.trim().length === 0)) {
    res.status(400).json({ error: "kitchenId must be a non-empty string" });
    return;
  }
  if (categoryId !== undefined && categoryId !== null && typeof categoryId !== "string") {
    res.status(400).json({ error: "categoryId must be a string or null" });
    return;
  }
  if (imageUrl !== undefined && imageUrl !== null && typeof imageUrl !== "string") {
    res.status(400).json({ error: "imageUrl must be a string or null" });
    return;
  }
  if (isAvailableInPOS !== undefined && typeof isAvailableInPOS !== "boolean") {
    res.status(400).json({ error: "isAvailableInPOS must be a boolean" });
    return;
  }
  if (isAvailableOnline !== undefined && typeof isAvailableOnline !== "boolean") {
    res.status(400).json({ error: "isAvailableOnline must be a boolean" });
    return;
  }
  if (isOpenPrice !== undefined && typeof isOpenPrice !== "boolean") {
    res.status(400).json({ error: "isOpenPrice must be a boolean" });
    return;
  }

  // Explicit null converts this item to sized (clears its standalone price); undefined
  // (the key simply absent) leaves the existing price untouched.
  let priceDecimal: Prisma.Decimal | null | undefined;
  if (price === null) {
    priceDecimal = null;
  } else if (price !== undefined) {
    if (typeof price !== "string" && typeof price !== "number") {
      res.status(400).json({ error: "price must be a valid decimal number, null, or omitted" });
      return;
    }
    try {
      priceDecimal = new Prisma.Decimal(price);
    } catch {
      res.status(400).json({ error: "price must be a valid decimal number" });
      return;
    }
    if (priceDecimal.isNaN() || priceDecimal.isNegative()) {
      res.status(400).json({ error: "price must be a non-negative number" });
      return;
    }
  }

  let minPriceDecimal: Prisma.Decimal | null | undefined;
  if (minPrice !== undefined) {
    const parsed = parseNullablePrice(minPrice);
    if (!parsed.ok) {
      res.status(400).json({ error: `minPrice: ${parsed.error}` });
      return;
    }
    minPriceDecimal = parsed.value;
  }
  let maxPriceDecimal: Prisma.Decimal | null | undefined;
  if (maxPrice !== undefined) {
    const parsed = parseNullablePrice(maxPrice);
    if (!parsed.ok) {
      res.status(400).json({ error: `maxPrice: ${parsed.error}` });
      return;
    }
    maxPriceDecimal = parsed.value;
  }

  const existing = await menuService.getMenuItemCoreById(req.params.id as string);
  if (!existing) {
    res.status(404).json({ error: "Menu item not found" });
    return;
  }

  const effectiveIsOpenPrice = isOpenPrice !== undefined ? isOpenPrice : existing.isOpenPrice;
  const effectivePrice = priceDecimal !== undefined ? priceDecimal : existing.price;
  const effectiveMinPrice = minPriceDecimal !== undefined ? minPriceDecimal : existing.minPrice;
  const effectiveMaxPrice = maxPriceDecimal !== undefined ? maxPriceDecimal : existing.maxPrice;

  if (effectiveIsOpenPrice && effectivePrice !== null) {
    res.status(400).json({ error: "an open-price item cannot also have a fixed price" });
    return;
  }
  if (effectiveIsOpenPrice && existing.variants.length > 0) {
    res.status(400).json({ error: "remove this item's sizes before marking it as open price" });
    return;
  }
  if (!effectiveIsOpenPrice && (effectiveMinPrice !== null || effectiveMaxPrice !== null)) {
    res.status(400).json({ error: "minPrice/maxPrice only apply to an open-price item" });
    return;
  }
  if (effectiveMinPrice !== null && effectiveMaxPrice !== null && effectiveMinPrice.greaterThan(effectiveMaxPrice)) {
    res.status(400).json({ error: "minPrice must be less than or equal to maxPrice" });
    return;
  }

  if (kitchenId !== undefined) {
    const kitchenFound = await menuService.kitchenExists(kitchenId);
    if (!kitchenFound) {
      res.status(400).json({ error: "kitchenId does not reference an existing Kitchen" });
      return;
    }
  }
  if (categoryId !== undefined && categoryId !== null) {
    const categoryFound = await menuService.categoryExists(categoryId);
    if (!categoryFound) {
      res.status(400).json({ error: "categoryId does not reference an existing Category" });
      return;
    }
  }

  try {
    const menuItem = await menuService.updateMenuItem(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(priceDecimal !== undefined ? { price: priceDecimal } : {}),
      ...(kitchenId !== undefined ? { kitchenId } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(isAvailableInPOS !== undefined ? { isAvailableInPOS } : {}),
      ...(isAvailableOnline !== undefined ? { isAvailableOnline } : {}),
      ...(isOpenPrice !== undefined ? { isOpenPrice } : {}),
      ...(minPriceDecimal !== undefined ? { minPrice: minPriceDecimal } : {}),
      ...(maxPriceDecimal !== undefined ? { maxPrice: maxPriceDecimal } : {}),
    });
    res.json(menuItem);
  } catch (error) {
    if (menuService.isNotFoundError(error)) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }
    if (menuService.isForeignKeyConstraintError(error)) {
      res.status(400).json({ error: "kitchenId or categoryId does not reference an existing record" });
      return;
    }
    throw error;
  }
}

export async function patchOnlineAvailability(req: Request, res: Response) {
  const { isAvailableOnline } = req.body ?? {};

  if (typeof isAvailableOnline !== "boolean") {
    res.status(400).json({ error: "isAvailableOnline must be a boolean" });
    return;
  }

  try {
    const menuItem = await menuService.setOnlineAvailability(req.params.id as string, isAvailableOnline);
    res.json(menuItem);
  } catch (error) {
    if (menuService.isNotFoundError(error)) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }
    throw error;
  }
}

export async function deleteMenuItem(req: Request, res: Response) {
  try {
    await menuService.deleteMenuItem(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (menuService.isNotFoundError(error)) {
      res.status(404).json({ error: "Menu item not found" });
      return;
    }
    if (menuService.isForeignKeyConstraintError(error)) {
      res.status(409).json({
        error: "Cannot delete menu item: it still has order items or inventory links referencing it",
      });
      return;
    }
    throw error;
  }
}

// ================= Variants (sizes) =================

// Returns `{ ok: true, value }` on success (value may be null — a deal-only size) or
// `{ ok: false, error }` with a ready-to-send message. Shared by create/update below so
// the same decimal rules (and the same error wording) apply to both.
function parseNullablePrice(price: unknown): { ok: true; value: Prisma.Decimal | null } | { ok: false; error: string } {
  if (price === null) {
    return { ok: true, value: null };
  }
  if (typeof price !== "string" && typeof price !== "number") {
    return { ok: false, error: "price must be a valid decimal number, null, or omitted" };
  }
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(price);
  } catch {
    return { ok: false, error: "price must be a valid decimal number" };
  }
  if (decimal.isNaN() || decimal.isNegative()) {
    return { ok: false, error: "price must be a non-negative number" };
  }
  return { ok: true, value: decimal };
}

export async function createVariant(req: Request, res: Response) {
  const { label, price, sortOrder } = req.body ?? {};
  const menuItemId = req.params.id as string;

  if (typeof label !== "string" || label.trim().length === 0) {
    res.status(400).json({ error: "label is required" });
    return;
  }
  if (sortOrder !== undefined && !Number.isInteger(sortOrder)) {
    res.status(400).json({ error: "sortOrder must be an integer" });
    return;
  }

  let priceValue: Prisma.Decimal | null | undefined;
  if (price !== undefined) {
    const parsed = parseNullablePrice(price);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    priceValue = parsed.value;
  }

  const menuItem = await menuService.getMenuItemOpenPriceFlag(menuItemId);
  if (!menuItem) {
    res.status(404).json({ error: "Menu item not found" });
    return;
  }
  if (menuItem.isOpenPrice) {
    res.status(400).json({ error: "cannot add a size to an open-price item" });
    return;
  }

  try {
    const variant = await menuService.createVariant(menuItemId, {
      label: label.trim(),
      ...(priceValue !== undefined ? { price: priceValue } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    });
    res.status(201).json(variant);
  } catch (error) {
    if (menuService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A size with this label already exists on this item" });
      return;
    }
    throw error;
  }
}

export async function updateVariant(req: Request, res: Response) {
  const { label, price, sortOrder } = req.body ?? {};
  const menuItemId = req.params.id as string;
  const variantId = req.params.variantId as string;

  if (label !== undefined && (typeof label !== "string" || label.trim().length === 0)) {
    res.status(400).json({ error: "label must be a non-empty string" });
    return;
  }
  if (sortOrder !== undefined && !Number.isInteger(sortOrder)) {
    res.status(400).json({ error: "sortOrder must be an integer" });
    return;
  }

  let priceValue: Prisma.Decimal | null | undefined;
  if (price !== undefined) {
    const parsed = parseNullablePrice(price);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    priceValue = parsed.value;
  }

  const existing = await menuService.getVariantById(menuItemId, variantId);
  if (!existing) {
    res.status(404).json({ error: "Size not found on this menu item" });
    return;
  }

  try {
    const variant = await menuService.updateVariant(variantId, {
      ...(label !== undefined ? { label: label.trim() } : {}),
      ...(priceValue !== undefined ? { price: priceValue } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
    });
    res.json(variant);
  } catch (error) {
    if (menuService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A size with this label already exists on this item" });
      return;
    }
    throw error;
  }
}

export async function deleteVariant(req: Request, res: Response) {
  const menuItemId = req.params.id as string;
  const variantId = req.params.variantId as string;

  const existing = await menuService.getVariantById(menuItemId, variantId);
  if (!existing) {
    res.status(404).json({ error: "Size not found on this menu item" });
    return;
  }

  try {
    await menuService.deleteVariant(variantId);
    res.status(204).send();
  } catch (error) {
    if (menuService.isForeignKeyConstraintError(error)) {
      res.status(409).json({ error: "Cannot delete this size: it's used by a deal" });
      return;
    }
    throw error;
  }
}

// PATCH /:id/online-content — the customer-website fields only (see menuService.updateMenuItemOnlineContent). Open to
// ONLINE_ADMIN as well as POS_ADMIN/SUPER_ADMIN; any other field in the body is a 400, so a price
// or kitchen can never be changed through here.
export async function patchOnlineContent(req: Request, res: Response) {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "A JSON object body is required" });
    return;
  }
  const parsed = parseMenuItemContentUpdate(body as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (Object.keys(parsed.value).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  try {
    const menuItem = await menuService.updateMenuItemOnlineContent(req.params.id as string, parsed.value);
    res.json({ ...menuItem, image: menuItem.imageId ? mediaUrls(menuItem.imageId) : null });
  } catch (error) {
    if (respondToSiteContentError(error, res, "Menu item not found")) return;
    throw error;
  }
}
