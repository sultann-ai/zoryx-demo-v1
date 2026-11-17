import { Request, Response } from "express";
import { InventoryTrackingType, InventoryTxnType, Prisma } from "../../../generated/prisma/client";
import * as inventoryService from "./inventory.service";

const VALID_TRACKING_TYPES = Object.values(InventoryTrackingType);
// The manual adjust endpoint's types only — RESTOCK_CANCEL is written by order cancellation alone.
const VALID_TXN_TYPES = [InventoryTxnType.STOCK_IN, InventoryTxnType.STOCK_OUT, InventoryTxnType.ADJUSTMENT];

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  try {
    return new Prisma.Decimal(value);
  } catch {
    return undefined;
  }
}

// ================= InventoryItem =================

export async function listInventoryItems(req: Request, res: Response) {
  const { lowStock } = req.query;

  if (lowStock === "true") {
    const items = await inventoryService.getLowStockItems();
    res.json(items);
    return;
  }

  const items = await inventoryService.listInventoryItems();
  res.json(items);
}

export async function getInventoryItem(req: Request, res: Response) {
  const item = await inventoryService.getInventoryItemById(req.params.id as string);
  if (!item) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }
  res.json(item);
}

export async function createInventoryItem(req: Request, res: Response) {
  const { name, unit, currentStock, minThreshold, trackingType } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof unit !== "string" || unit.trim().length === 0) {
    res.status(400).json({ error: "unit is required" });
    return;
  }
  if (!isOneOf(trackingType, VALID_TRACKING_TYPES)) {
    res.status(400).json({ error: `trackingType must be one of: ${VALID_TRACKING_TYPES.join(", ")}` });
    return;
  }

  const currentStockDecimal = parseDecimal(currentStock);
  if (!currentStockDecimal || currentStockDecimal.isNaN() || currentStockDecimal.isNegative()) {
    res.status(400).json({ error: "currentStock is required and must be a non-negative number" });
    return;
  }

  let minThresholdDecimal: Prisma.Decimal | undefined;
  if (minThreshold !== undefined) {
    minThresholdDecimal = parseDecimal(minThreshold);
    if (!minThresholdDecimal || minThresholdDecimal.isNaN() || minThresholdDecimal.isNegative()) {
      res.status(400).json({ error: "minThreshold must be a non-negative number" });
      return;
    }
  }

  const item = await inventoryService.createInventoryItem({
    name: name.trim(),
    unit: unit.trim(),
    currentStock: currentStockDecimal,
    trackingType,
    ...(minThresholdDecimal !== undefined ? { minThreshold: minThresholdDecimal } : {}),
  });
  res.status(201).json(item);
}

export async function updateInventoryItem(req: Request, res: Response) {
  const { name, unit, minThreshold, trackingType, currentStock } = req.body ?? {};

  if (currentStock !== undefined) {
    res.status(400).json({
      error: "currentStock cannot be changed via update; use POST /inventory/:id/adjust instead",
    });
    return;
  }
  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (unit !== undefined && (typeof unit !== "string" || unit.trim().length === 0)) {
    res.status(400).json({ error: "unit must be a non-empty string" });
    return;
  }
  if (trackingType !== undefined && !isOneOf(trackingType, VALID_TRACKING_TYPES)) {
    res.status(400).json({ error: `trackingType must be one of: ${VALID_TRACKING_TYPES.join(", ")}` });
    return;
  }

  let minThresholdDecimal: Prisma.Decimal | null | undefined;
  if (minThreshold !== undefined) {
    if (minThreshold === null) {
      minThresholdDecimal = null;
    } else {
      minThresholdDecimal = parseDecimal(minThreshold);
      if (!minThresholdDecimal || minThresholdDecimal.isNaN() || minThresholdDecimal.isNegative()) {
        res.status(400).json({ error: "minThreshold must be a non-negative number or null" });
        return;
      }
    }
  }

  try {
    const item = await inventoryService.updateInventoryItem(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(unit !== undefined ? { unit: unit.trim() } : {}),
      ...(minThresholdDecimal !== undefined ? { minThreshold: minThresholdDecimal } : {}),
      ...(trackingType !== undefined ? { trackingType } : {}),
    });
    res.json(item);
  } catch (error) {
    if (inventoryService.isNotFoundError(error)) {
      res.status(404).json({ error: "Inventory item not found" });
      return;
    }
    throw error;
  }
}

export async function deleteInventoryItem(req: Request, res: Response) {
  try {
    await inventoryService.deleteInventoryItem(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (inventoryService.isNotFoundError(error)) {
      res.status(404).json({ error: "Inventory item not found" });
      return;
    }
    if (error instanceof inventoryService.InventoryItemInUseError) {
      res.status(409).json({ error: `${error.message}. Remove those links first.` });
      return;
    }
    if (inventoryService.isForeignKeyConstraintError(error)) {
      res.status(409).json({ error: "Cannot delete inventory item: it still has linked records" });
      return;
    }
    throw error;
  }
}

export async function adjustStock(req: Request, res: Response) {
  if (!req.staff) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const { type, quantity, note } = req.body ?? {};

  if (!isOneOf(type, VALID_TXN_TYPES)) {
    res.status(400).json({ error: `type must be one of: ${VALID_TXN_TYPES.join(", ")}` });
    return;
  }

  const quantityDecimal = parseDecimal(quantity);
  if (!quantityDecimal || quantityDecimal.isNaN() || quantityDecimal.isZero()) {
    res.status(400).json({ error: "quantity is required and must be a non-zero number" });
    return;
  }
  if (type !== InventoryTxnType.ADJUSTMENT && quantityDecimal.isNegative()) {
    res.status(400).json({ error: "quantity must be positive for STOCK_IN and STOCK_OUT" });
    return;
  }
  if (note !== undefined && typeof note !== "string") {
    res.status(400).json({ error: "note must be a string" });
    return;
  }

  try {
    const result = await inventoryService.adjustStock({
      inventoryItemId: req.params.id as string,
      type,
      quantity: quantityDecimal,
      performedById: req.staff.id,
      ...(note !== undefined ? { note } : {}),
    });
    res.status(200).json(result);
  } catch (error) {
    if (error instanceof inventoryService.InventoryItemNotFoundError) {
      res.status(404).json({ error: "Inventory item not found" });
      return;
    }
    if (error instanceof inventoryService.NotManuallyTrackedError) {
      res.status(400).json({
        error: "This inventory item is auto-tracked; it can only be adjusted by order-driven deduction",
      });
      return;
    }
    throw error;
  }
}

// ================= MenuItemInventoryLink =================

export async function listInventoryLinks(req: Request, res: Response) {
  const { menuItemId, inventoryItemId } = req.query;

  if (menuItemId !== undefined && typeof menuItemId !== "string") {
    res.status(400).json({ error: "menuItemId must be a single string value" });
    return;
  }
  if (inventoryItemId !== undefined && typeof inventoryItemId !== "string") {
    res.status(400).json({ error: "inventoryItemId must be a single string value" });
    return;
  }

  const links = await inventoryService.listInventoryLinks({
    ...(menuItemId !== undefined ? { menuItemId } : {}),
    ...(inventoryItemId !== undefined ? { inventoryItemId } : {}),
  });
  res.json(links);
}

export async function getInventoryLink(req: Request, res: Response) {
  const link = await inventoryService.getInventoryLinkById(req.params.id as string);
  if (!link) {
    res.status(404).json({ error: "Menu item inventory link not found" });
    return;
  }
  res.json(link);
}

export async function createInventoryLink(req: Request, res: Response) {
  const { menuItemId, inventoryItemId, quantityPerOrder } = req.body ?? {};

  if (typeof menuItemId !== "string" || menuItemId.trim().length === 0) {
    res.status(400).json({ error: "menuItemId is required" });
    return;
  }
  if (typeof inventoryItemId !== "string" || inventoryItemId.trim().length === 0) {
    res.status(400).json({ error: "inventoryItemId is required" });
    return;
  }
  const quantityDecimal = parseDecimal(quantityPerOrder);
  if (!quantityDecimal || quantityDecimal.isNaN() || quantityDecimal.lessThanOrEqualTo(0)) {
    res.status(400).json({ error: "quantityPerOrder is required and must be a positive number" });
    return;
  }

  const menuItemFound = await inventoryService.menuItemExists(menuItemId);
  if (!menuItemFound) {
    res.status(400).json({ error: "menuItemId does not reference an existing MenuItem" });
    return;
  }
  const inventoryItemFound = await inventoryService.inventoryItemExists(inventoryItemId);
  if (!inventoryItemFound) {
    res.status(400).json({ error: "inventoryItemId does not reference an existing InventoryItem" });
    return;
  }

  try {
    const link = await inventoryService.createInventoryLink({
      menuItemId,
      inventoryItemId,
      quantityPerOrder: quantityDecimal,
    });
    res.status(201).json(link);
  } catch (error) {
    if (inventoryService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "This menu item is already linked to this inventory item" });
      return;
    }
    throw error;
  }
}

export async function updateInventoryLink(req: Request, res: Response) {
  const { menuItemId, inventoryItemId, quantityPerOrder } = req.body ?? {};

  if (menuItemId !== undefined && (typeof menuItemId !== "string" || menuItemId.trim().length === 0)) {
    res.status(400).json({ error: "menuItemId must be a non-empty string" });
    return;
  }
  if (
    inventoryItemId !== undefined &&
    (typeof inventoryItemId !== "string" || inventoryItemId.trim().length === 0)
  ) {
    res.status(400).json({ error: "inventoryItemId must be a non-empty string" });
    return;
  }

  let quantityDecimal: Prisma.Decimal | undefined;
  if (quantityPerOrder !== undefined) {
    quantityDecimal = parseDecimal(quantityPerOrder);
    if (!quantityDecimal || quantityDecimal.isNaN() || quantityDecimal.lessThanOrEqualTo(0)) {
      res.status(400).json({ error: "quantityPerOrder must be a positive number" });
      return;
    }
  }

  if (menuItemId !== undefined) {
    const menuItemFound = await inventoryService.menuItemExists(menuItemId);
    if (!menuItemFound) {
      res.status(400).json({ error: "menuItemId does not reference an existing MenuItem" });
      return;
    }
  }
  if (inventoryItemId !== undefined) {
    const inventoryItemFound = await inventoryService.inventoryItemExists(inventoryItemId);
    if (!inventoryItemFound) {
      res.status(400).json({ error: "inventoryItemId does not reference an existing InventoryItem" });
      return;
    }
  }

  try {
    const link = await inventoryService.updateInventoryLink(req.params.id as string, {
      ...(menuItemId !== undefined ? { menuItemId } : {}),
      ...(inventoryItemId !== undefined ? { inventoryItemId } : {}),
      ...(quantityDecimal !== undefined ? { quantityPerOrder: quantityDecimal } : {}),
    });
    res.json(link);
  } catch (error) {
    if (inventoryService.isNotFoundError(error)) {
      res.status(404).json({ error: "Menu item inventory link not found" });
      return;
    }
    if (inventoryService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "This menu item is already linked to this inventory item" });
      return;
    }
    throw error;
  }
}

export async function deleteInventoryLink(req: Request, res: Response) {
  try {
    await inventoryService.deleteInventoryLink(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (inventoryService.isNotFoundError(error)) {
      res.status(404).json({ error: "Menu item inventory link not found" });
      return;
    }
    throw error;
  }
}
