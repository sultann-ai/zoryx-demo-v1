import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

const addOnInclude = {
  prices: { orderBy: { size: "asc" } },
  category: true,
} satisfies Prisma.AddOnInclude;

export interface CreateAddOnInput {
  name: string;
  categoryId: string;
}

export interface UpdateAddOnInput {
  name?: string;
  categoryId?: string;
}

export interface SetAddOnPriceInput {
  size: string;
  price: Prisma.Decimal;
}

export function listAddOns() {
  return prisma.addOn.findMany({ include: addOnInclude, orderBy: { name: "asc" } });
}

export function getAddOnById(id: string) {
  return prisma.addOn.findUnique({ where: { id }, include: addOnInclude });
}

export function categoryExists(id: string) {
  return prisma.category.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

export function createAddOn(data: CreateAddOnInput) {
  return prisma.addOn.create({
    data: { name: data.name, categoryId: data.categoryId },
    include: addOnInclude,
  });
}

export function updateAddOn(id: string, data: UpdateAddOnInput) {
  return prisma.addOn.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
    },
    include: addOnInclude,
  });
}

export function deleteAddOn(id: string) {
  return prisma.addOn.delete({ where: { id } });
}

// A price is set per (addOnId, size) — upsert so "edit the price for this size"
// and "add a new size to this add-on" are the same call.
export function setAddOnPrice(addOnId: string, data: SetAddOnPriceInput) {
  return prisma.addOnPrice.upsert({
    where: { addOnId_size: { addOnId, size: data.size } },
    update: { price: data.price },
    create: { addOnId, size: data.size, price: data.price },
  });
}

export function removeAddOnPrice(addOnId: string, size: string) {
  return prisma.addOnPrice.delete({ where: { addOnId_size: { addOnId, size } } });
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
