import bcrypt from "bcrypt";
import { Prisma, StaffRole } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

const staffSelect = {
  id: true,
  name: true,
  username: true,
  role: true,
  kitchenId: true,
  employeeId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.StaffUserSelect;

export interface CreateStaffInput {
  name: string;
  username: string;
  password: string;
  role: StaffRole;
  kitchenId?: string;
  employeeId?: string;
}

export interface UpdateStaffInput {
  name?: string;
  role?: StaffRole;
  kitchenId?: string | null;
  employeeId?: string | null;
  isActive?: boolean;
  password?: string;
}

export function listStaff() {
  // "Delete" only deactivates (the row is kept for order history), so hide inactive staff here.
  return prisma.staffUser.findMany({ where: { isActive: true }, select: staffSelect, orderBy: { name: "asc" } });
}

export function getStaffById(id: string) {
  return prisma.staffUser.findUnique({ where: { id }, select: staffSelect });
}

export async function createStaff(data: CreateStaffInput) {
  const passwordHash = await bcrypt.hash(data.password, 10);

  return prisma.staffUser.create({
    data: {
      name: data.name,
      username: data.username,
      passwordHash,
      role: data.role,
      ...(data.kitchenId !== undefined ? { kitchenId: data.kitchenId } : {}),
      ...(data.employeeId !== undefined ? { employeeId: data.employeeId } : {}),
    },
    select: staffSelect,
  });
}

export async function updateStaff(id: string, data: UpdateStaffInput) {
  const passwordHash = data.password !== undefined ? await bcrypt.hash(data.password, 10) : undefined;

  return prisma.staffUser.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.role !== undefined ? { role: data.role } : {}),
      ...(data.kitchenId !== undefined ? { kitchenId: data.kitchenId } : {}),
      ...(data.employeeId !== undefined ? { employeeId: data.employeeId } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      ...(passwordHash !== undefined ? { passwordHash } : {}),
    },
    select: staffSelect,
  });
}

// Soft delete. The row stays (orders and ledgers point at it), but `username` and `employeeId`
// are unique, so a plain isActive=false would block anyone from reusing them. Free both here:
// the username becomes an unusable tombstone and the employee link is cleared.
export function deactivateStaff(id: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.staffUser.findUnique({ where: { id }, select: { username: true, isActive: true } });
    if (!existing) {
      // Same P2025 the controller already maps to 404.
      return tx.staffUser.update({ where: { id }, data: { isActive: false }, select: staffSelect });
    }
    return tx.staffUser.update({
      where: { id },
      data: {
        isActive: false,
        employeeId: null,
        // Already-deleted accounts keep their existing tombstone.
        ...(existing.isActive ? { username: `${existing.username}~deleted~${id.slice(0, 8)}` } : {}),
      },
      select: staffSelect,
    });
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
