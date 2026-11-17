import { Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client";
import * as addOnService from "./addon.service";

export async function listAddOns(_req: Request, res: Response) {
  const addOns = await addOnService.listAddOns();
  res.json(addOns);
}

export async function getAddOn(req: Request, res: Response) {
  const addOn = await addOnService.getAddOnById(req.params.id as string);
  if (!addOn) {
    res.status(404).json({ error: "Add-on not found" });
    return;
  }
  res.json(addOn);
}

export async function createAddOn(req: Request, res: Response) {
  const { name, categoryId } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  // Required, not optional: letting an add-on go unscoped is exactly what let "Extra
  // Cheese" (priced for pizza's "Large") get offered on a Large Fries too.
  if (typeof categoryId !== "string" || categoryId.trim().length === 0) {
    res.status(400).json({ error: "categoryId is required" });
    return;
  }

  const categoryFound = await addOnService.categoryExists(categoryId);
  if (!categoryFound) {
    res.status(400).json({ error: "categoryId does not reference an existing Category" });
    return;
  }

  try {
    const addOn = await addOnService.createAddOn({ name: name.trim(), categoryId });
    res.status(201).json(addOn);
  } catch (error) {
    if (addOnService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "An add-on with this name already exists" });
      return;
    }
    throw error;
  }
}

export async function updateAddOn(req: Request, res: Response) {
  const { name, categoryId } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (categoryId !== undefined && (typeof categoryId !== "string" || categoryId.trim().length === 0)) {
    res.status(400).json({ error: "categoryId must be a non-empty string" });
    return;
  }

  if (categoryId !== undefined) {
    const categoryFound = await addOnService.categoryExists(categoryId);
    if (!categoryFound) {
      res.status(400).json({ error: "categoryId does not reference an existing Category" });
      return;
    }
  }

  try {
    const addOn = await addOnService.updateAddOn(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
    });
    res.json(addOn);
  } catch (error) {
    if (addOnService.isNotFoundError(error)) {
      res.status(404).json({ error: "Add-on not found" });
      return;
    }
    if (addOnService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "An add-on with this name already exists" });
      return;
    }
    throw error;
  }
}

export async function deleteAddOn(req: Request, res: Response) {
  try {
    await addOnService.deleteAddOn(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (addOnService.isNotFoundError(error)) {
      res.status(404).json({ error: "Add-on not found" });
      return;
    }
    throw error;
  }
}

// ================= Prices (per size) =================

export async function setAddOnPrice(req: Request, res: Response) {
  const { price } = req.body ?? {};
  const addOnId = req.params.id as string;
  const size = req.params.size as string;

  let priceDecimal: Prisma.Decimal;
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

  const addOn = await addOnService.getAddOnById(addOnId);
  if (!addOn) {
    res.status(404).json({ error: "Add-on not found" });
    return;
  }

  const priceRow = await addOnService.setAddOnPrice(addOnId, { size, price: priceDecimal });
  res.status(200).json(priceRow);
}

export async function removeAddOnPrice(req: Request, res: Response) {
  const addOnId = req.params.id as string;
  const size = req.params.size as string;

  try {
    await addOnService.removeAddOnPrice(addOnId, size);
    res.status(204).send();
  } catch (error) {
    if (addOnService.isNotFoundError(error)) {
      res.status(404).json({ error: "This add-on has no price for that size" });
      return;
    }
    throw error;
  }
}
