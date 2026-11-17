import { Request, Response } from "express";
import * as kitchenService from "./kitchen.service";

export async function listKitchens(_req: Request, res: Response) {
  const kitchens = await kitchenService.listKitchens();
  res.json(kitchens);
}

export async function getKitchen(req: Request, res: Response) {
  const kitchen = await kitchenService.getKitchenById(req.params.id as string);
  if (!kitchen) {
    res.status(404).json({ error: "Kitchen not found" });
    return;
  }
  res.json(kitchen);
}

export async function createKitchen(req: Request, res: Response) {
  const { name, isActive } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  try {
    const kitchen = await kitchenService.createKitchen({
      name: name.trim(),
      ...(isActive !== undefined ? { isActive } : {}),
    });
    res.status(201).json(kitchen);
  } catch (error) {
    if (kitchenService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A kitchen with this name already exists" });
      return;
    }
    throw error;
  }
}

export async function updateKitchen(req: Request, res: Response) {
  const { name, isActive } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  try {
    const kitchen = await kitchenService.updateKitchen(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    });
    res.json(kitchen);
  } catch (error) {
    if (kitchenService.isNotFoundError(error)) {
      res.status(404).json({ error: "Kitchen not found" });
      return;
    }
    if (kitchenService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A kitchen with this name already exists" });
      return;
    }
    throw error;
  }
}

export async function deleteKitchen(req: Request, res: Response) {
  try {
    await kitchenService.deleteKitchen(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (kitchenService.isNotFoundError(error)) {
      res.status(404).json({ error: "Kitchen not found" });
      return;
    }
    if (kitchenService.isForeignKeyConstraintError(error)) {
      res.status(409).json({
        error: "Cannot delete kitchen: it still has staff, menu items, or order items linked to it",
      });
      return;
    }
    throw error;
  }
}
