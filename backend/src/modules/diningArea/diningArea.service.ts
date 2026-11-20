import { Prisma, DiningAreaType } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { TableStaffError } from "../table/tableErrors";

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
  outOfService?: boolean;
  defaultWaiterStaffId?: string | null;
}

export interface UpdateDiningAreaInput {
  name?: string;
  type?: DiningAreaType;
  area?: string | null;
  capacity?: number | null;
  isActive?: boolean;
  outOfService?: boolean;
  defaultWaiterStaffId?: string | null;
}

// The table's QR key is never in these responses — ORDER_TAKER reads them. Only the QR sheet and
// regenerate endpoints (SA/PA) hand it out.
const hideQrKey = { qrKey: true } as const;

export function listDiningAreas() {
  return prisma.diningArea.findMany({ orderBy: { name: "asc" }, omit: hideQrKey });
}

export function getDiningAreaById(id: string) {
  return prisma.diningArea.findUnique({ where: { id }, omit: hideQrKey });
}

export function createDiningArea(data: CreateDiningAreaInput) {
  return prisma.diningArea.create({
    data: {
      name: data.name,
      type: data.type,
      ...(data.area !== undefined ? { area: data.area } : {}),
      ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(data.outOfService !== undefined ? { outOfService: data.outOfService } : {}),
      ...(data.defaultWaiterStaffId !== undefined ? { defaultWaiterStaffId: data.defaultWaiterStaffId } : {}),
    },
    omit: hideQrKey,
  });
}

// Table sync R8: a table that has guests (an OPEN session, its own or merged into another) can't be switched
// off, put out of service or deleted — their orders and bill would vanish from the floor map. Checked under the
// table's row lock, the same lock an order that opens a session takes, so the two can't cross.
async function assertTableNotInUse(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "DiningArea" WHERE "id" = ${id} FOR UPDATE`;
  const open = await tx.tableSession.findFirst({
    where: { diningAreaId: id, status: "OPEN" },
    select: { seatedAt: true, diningArea: { select: { name: true } } },
  });
  if (open) {
    const since = new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", hour: "numeric", minute: "2-digit" }).format(open.seatedAt);
    throw new TableStaffError(409, "TABLE_IN_USE", `${open.diningArea.name} has guests (open since ${since}). Close or move them first.`);
  }
}

export function updateDiningArea(id: string, data: UpdateDiningAreaInput) {
  return prisma.$transaction(async (tx) => {
    if (data.isActive === false || data.outOfService === true) {
      await assertTableNotInUse(tx, id);
    }
    return tx.diningArea.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.area !== undefined ? { area: data.area } : {}),
        ...(data.capacity !== undefined ? { capacity: data.capacity } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.outOfService !== undefined ? { outOfService: data.outOfService } : {}),
        ...(data.defaultWaiterStaffId !== undefined ? { defaultWaiterStaffId: data.defaultWaiterStaffId } : {}),
      },
      omit: hideQrKey,
    });
  });
}

export function deleteDiningArea(id: string) {
  return prisma.$transaction(async (tx) => {
    await assertTableNotInUse(tx, id);
    return tx.diningArea.delete({ where: { id } });
  });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
