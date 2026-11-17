import { MediaKind, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { assertAttachable, releaseMediaIfUnreferenced } from "../media/media.service";
import { RecordNotFoundError } from "../siteContent/siteContent.errors";

export function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

export function getCategoryById(id: string) {
  return prisma.category.findUnique({ where: { id } });
}

export function categoryExists(id: string) {
  return prisma.category.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

export function createCategory(data: { name: string }) {
  return prisma.category.create({ data });
}

export function updateCategory(id: string, data: { name?: string }) {
  return prisma.category.update({ where: { id }, data });
}

// Photo, Urdu name and display order for the customer website. Replacing the photo deletes the old
// asset in the same transaction.
export function updateCategoryOnlineContent(id: string, data: Record<string, unknown>) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.category.findUnique({ where: { id }, select: { imageId: true } });
    if (!current) {
      throw new RecordNotFoundError();
    }
    if (typeof data.imageId === "string" && data.imageId !== current.imageId) {
      await assertAttachable(tx, data.imageId, MediaKind.CATEGORY);
    }
    const updated = await tx.category.update({ where: { id }, data: data as Prisma.CategoryUncheckedUpdateInput });
    if (data.imageId !== undefined && current.imageId !== updated.imageId) {
      await releaseMediaIfUnreferenced(tx, current.imageId);
    }
    return updated;
  });
}

export function deleteCategory(id: string) {
  return prisma.$transaction(async (tx) => {
    const deleted = await tx.category.delete({ where: { id } });
    await releaseMediaIfUnreferenced(tx, deleted.imageId);
    return deleted;
  });
}

export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
