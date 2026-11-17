import { Prisma, DiningAreaType } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

// The table's room/section ("Family Hall") — see DiningArea.area's schema comment.
export const DINING_AREA_SECTION_MAX_LENGTH = 50;

export class InvalidDiningAreaSectionError extends Error {}

// undefined = not sent (leave as is); null = no area. Trims and collapses inner whitespace so
// "Family  Hall " and "Family Hall" can't become two separate filter chips; blank → null.
export function parseAreaField(raw: unknown): string | null | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (raw === null) {
    return null;
  }
  if (typeof raw !== "string") {
    throw new InvalidDiningAreaSectionError("area must be a string or null");
  }
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (normalized.length > DINING_AREA_SECTION_MAX_LENGTH) {
    throw new InvalidDiningAreaSectionError(`area must be at most ${DINING_AREA_SECTION_MAX_LENGTH} characters`);
  }
  return normalized.length > 0 ? normalized : null;
}

export interface CreateDiningAreaInput {
  name: string;
  type: DiningAreaType;
  area?: string | null;
  capacity?: number;
  isActive?: boolean;
}

export interface UpdateDiningAreaInput {
  name?: string;
  type?: DiningAreaType;
  area?: string | null;
  capacity?: number | null;
  isActive?: boolean;
}

export function listDiningAreas() {
  return prisma.diningArea.findMany({ orderBy: { name: "asc" } });
}

export function getDiningAreaById(id: string) {
  return prisma.diningArea.findUnique({ where: { id } });
}

export function createDiningArea(data: CreateDiningAreaInput) {
  return prisma.diningArea.create({
    data: {
      name: data.name,
      type: data.type,
      ...(data.area !== undefined ? { area: data.area } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export function updateDiningArea(id: string, data: UpdateDiningAreaInput) {
  return prisma.diningArea.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.type !== undefined ? { type: data.type } : {}),
      ...(data.area !== undefined ? { area: data.area } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export function deleteDiningArea(id: string) {
  return prisma.diningArea.delete({ where: { id } });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
