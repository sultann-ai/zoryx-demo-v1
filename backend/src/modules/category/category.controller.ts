import { Request, Response } from "express";
import { mediaUrls } from "../../common/media/mediaUrls";
import { respondToSiteContentError } from "../siteContent/siteContent.errors";
import { parseCategoryContentUpdate } from "../siteContent/siteContent.validators";
import * as categoryService from "./category.service";

export async function listCategories(_req: Request, res: Response) {
  const categories = await categoryService.listCategories();
  res.json(categories);
}

export async function getCategory(req: Request, res: Response) {
  const category = await categoryService.getCategoryById(req.params.id as string);
  if (!category) {
    res.status(404).json({ error: "Category not found" });
    return;
  }
  res.json(category);
}

export async function createCategory(req: Request, res: Response) {
  const { name } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  try {
    const category = await categoryService.createCategory({ name: name.trim() });
    res.status(201).json(category);
  } catch (error) {
    if (categoryService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A category with this name already exists" });
      return;
    }
    throw error;
  }
}

export async function updateCategory(req: Request, res: Response) {
  const { name } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }

  try {
    const category = await categoryService.updateCategory(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
    });
    res.json(category);
  } catch (error) {
    if (categoryService.isNotFoundError(error)) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    if (categoryService.isUniqueConstraintError(error)) {
      res.status(409).json({ error: "A category with this name already exists" });
      return;
    }
    throw error;
  }
}

export async function deleteCategory(req: Request, res: Response) {
  try {
    await categoryService.deleteCategory(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (categoryService.isNotFoundError(error)) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    if (categoryService.isForeignKeyConstraintError(error)) {
      res.status(409).json({ error: "Cannot delete category: menu items still reference it" });
      return;
    }
    throw error;
  }
}

// PATCH /:id/online-content — the customer-website fields only (see categoryService.updateCategoryOnlineContent). Open to
// ONLINE_ADMIN as well as POS_ADMIN/SUPER_ADMIN; any other field in the body is a 400, so a price
// or kitchen can never be changed through here.
export async function patchOnlineContent(req: Request, res: Response) {
  const body = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "A JSON object body is required" });
    return;
  }
  const parsed = parseCategoryContentUpdate(body as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  if (Object.keys(parsed.value).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }
  try {
    const category = await categoryService.updateCategoryOnlineContent(req.params.id as string, parsed.value);
    res.json({ ...category, image: category.imageId ? mediaUrls(category.imageId) : null });
  } catch (error) {
    if (respondToSiteContentError(error, res, "Category not found")) return;
    throw error;
  }
}
