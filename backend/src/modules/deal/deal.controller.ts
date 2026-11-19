import { Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client";
import { mediaUrls } from "../../common/media/mediaUrls";
import { respondToSiteContentError } from "../siteContent/siteContent.errors";
import { parseDealContentUpdate } from "../siteContent/siteContent.validators";
import { toPublicDeals } from "../store/publicMappers";
import * as dealService from "./deal.service";

function parseDealItems(rawItems: unknown): dealService.DealItemInput[] | { error: string } {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: "items is required and must be a non-empty array" };
  }

  const seen = new Set<string>();
  const parsed: dealService.DealItemInput[] = [];
  for (const [index, item] of rawItems.entries()) {
    if (typeof item !== "object" || item === null) {
      return { error: `items[${index}] must be an object` };
    }
    const { menuItemId, quantity } = item as Record<string, unknown>;
    if (typeof menuItemId !== "string" || menuItemId.trim().length === 0) {
      return { error: `items[${index}].menuItemId is required` };
    }
    if (!Number.isInteger(quantity) || (quantity as number) <= 0) {
      return { error: `items[${index}].quantity must be a positive integer` };
    }
    if (seen.has(menuItemId)) {
      return { error: `items[${index}].menuItemId is duplicated; each menu item may appear once per deal` };
    }
    seen.add(menuItemId);
    parsed.push({ menuItemId, quantity: quantity as number });
  }
  return parsed;
}

async function validateMenuItemIdsExist(items: dealService.DealItemInput[]): Promise<string | null> {
  const ids = [...new Set(items.map((item) => item.menuItemId))];
  const found = await dealService.menuItemIdsExist(ids);
  const foundIds = new Set(found.map((menuItem) => menuItem.id));
  const missing = ids.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return `items reference menuItemId(s) that do not exist: ${missing.join(", ")}`;
  }
  // The cashier sets an open-price item's price at order time — it can never be a fixed
  // ingredient of a deal, whose own price is set once at deal-save time.
  const openPriceIds = found.filter((menuItem) => menuItem.isOpenPrice).map((menuItem) => menuItem.id);
  if (openPriceIds.length > 0) {
    return `items reference open-price menuItemId(s), which cannot be deal components: ${openPriceIds.join(", ")}`;
  }
  return null;
}

export async function listDeals(_req: Request, res: Response) {
  const deals = await dealService.listDeals();
  res.json(deals);
}

// Public. Shaped by toPublicDeals (an explicit whitelist). Cached for a minute on success only.
export async function listOnlineDeals(_req: Request, res: Response) {
  const deals = await dealService.listOnlineDeals();
  res.setHeader("Cache-Control", "public, max-age=60");
  res.json(toPublicDeals(deals));
}

export async function getDeal(req: Request, res: Response) {
  const deal = await dealService.getDealById(req.params.id as string);
  if (!deal) {
    res.status(404).json({ error: "Deal not found" });
    return;
  }
  res.json(deal);
}

export async function createDeal(req: Request, res: Response) {
  const { name, description, price, isActive, isAvailableInPOS, isAvailableOnline, items } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (description !== undefined && typeof description !== "string") {
    res.status(400).json({ error: "description must be a string" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
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

  if (typeof price !== "string" && typeof price !== "number") {
    res.status(400).json({ error: "price is required and must be a number" });
    return;
  }
  let priceDecimal: Prisma.Decimal;
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

  const parsedItems = parseDealItems(items);
  if ("error" in parsedItems) {
    res.status(400).json({ error: parsedItems.error });
    return;
  }

  const missingError = await validateMenuItemIdsExist(parsedItems);
  if (missingError) {
    res.status(400).json({ error: missingError });
    return;
  }

  const deal = await dealService.createDeal({
    name: name.trim(),
    price: priceDecimal,
    ...(description !== undefined ? { description } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
    ...(isAvailableInPOS !== undefined ? { isAvailableInPOS } : {}),
    ...(isAvailableOnline !== undefined ? { isAvailableOnline } : {}),
    items: parsedItems,
  });
  res.status(201).json(deal);
}

export async function updateDeal(req: Request, res: Response) {
  const { name, description, price, isActive, isAvailableInPOS, isAvailableOnline, items } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    res.status(400).json({ error: "description must be a string or null" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
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

  let priceDecimal: Prisma.Decimal | undefined;
  if (price !== undefined) {
    if (typeof price !== "string" && typeof price !== "number") {
      res.status(400).json({ error: "price must be a valid decimal number" });
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

  let parsedItems: dealService.DealItemInput[] | undefined;
  if (items !== undefined) {
    const result = parseDealItems(items);
    if ("error" in result) {
      res.status(400).json({ error: result.error });
      return;
    }
    parsedItems = result;
    const missingError = await validateMenuItemIdsExist(parsedItems);
    if (missingError) {
      res.status(400).json({ error: missingError });
      return;
    }
  }

  try {
    const deal = await dealService.updateDeal(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(priceDecimal !== undefined ? { price: priceDecimal } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(isAvailableInPOS !== undefined ? { isAvailableInPOS } : {}),
      ...(isAvailableOnline !== undefined ? { isAvailableOnline } : {}),
      ...(parsedItems !== undefined ? { items: parsedItems } : {}),
    });
    res.json(deal);
  } catch (error) {
    if (dealService.isNotFoundError(error)) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    throw error;
  }
}

// PATCH /:id/qr-availability — "Show on QR menu" (Table QR).
export async function patchQrAvailability(req: Request, res: Response) {
  const { isAvailableOnQr, ...rest } = (req.body ?? {}) as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || typeof isAvailableOnQr !== "boolean") {
    res.status(400).json({ error: "Send { isAvailableOnQr: boolean }" });
    return;
  }
  try {
    res.json(await dealService.setQrAvailability(req.params.id as string, isAvailableOnQr));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    throw error;
  }
}

export async function deleteDeal(req: Request, res: Response) {
  try {
    await dealService.deleteDeal(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (dealService.isNotFoundError(error)) {
      res.status(404).json({ error: "Deal not found" });
      return;
    }
    throw error;
  }
}

// PATCH /:id/online-content — the customer-website fields only (see dealService.updateDealOnlineContent). Open to
// ONLINE_ADMIN as well as POS_ADMIN/SUPER_ADMIN; any other field in the body is a 400, so a price
// or kitchen can never be changed through here.
export async function patchOnlineContent(req: Request, res: Response) {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "A JSON object body is required" });
    return;
  }
  const parsed = parseDealContentUpdate(body as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (Object.keys(parsed.value).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  try {
    const deal = await dealService.updateDealOnlineContent(req.params.id as string, parsed.value);
    res.json({ ...deal, image: deal.imageId ? mediaUrls(deal.imageId) : null });
  } catch (error) {
    if (respondToSiteContentError(error, res, "Deal not found")) return;
    throw error;
  }
}
