import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

export interface CreateKitchenInput {
  name: string;
  isActive?: boolean;
}

export interface UpdateKitchenInput {
  name?: string;
  isActive?: boolean;
}

export function listKitchens() {
  return prisma.kitchen.findMany({ orderBy: { name: "asc" } });
}

export function getKitchenById(id: string) {
  return prisma.kitchen.findUnique({ where: { id } });
}

export function createKitchen(data: CreateKitchenInput) {
  return prisma.kitchen.create({ data });
}

export function updateKitchen(id: string, data: UpdateKitchenInput) {
  return prisma.kitchen.update({ where: { id }, data });
}

export function deleteKitchen(id: string) {
  return prisma.kitchen.delete({ where: { id } });
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
