import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

export class EmployeeNotFoundError extends Error {}

export interface CreateEmployeeInput {
  name: string;
  phone?: string;
  designation: string;
  baseSalary: Prisma.Decimal;
  joiningDate: Date;
  isActive?: boolean;
}

export interface UpdateEmployeeInput {
  name?: string;
  phone?: string | null;
  designation?: string;
  baseSalary?: Prisma.Decimal;
  joiningDate?: Date;
  isActive?: boolean;
}

export function listEmployees() {
  return prisma.employee.findMany({ orderBy: { name: "asc" } });
}

export function getEmployeeById(id: string) {
  return prisma.employee.findUnique({ where: { id } });
}

export async function requireEmployee(id: string) {
  const employee = await prisma.employee.findUnique({ where: { id } });
  if (!employee) {
    throw new EmployeeNotFoundError(`Employee ${id} not found`);
  }
  return employee;
}

export function createEmployee(data: CreateEmployeeInput) {
  return prisma.employee.create({
    data: {
      name: data.name,
      designation: data.designation,
      baseSalary: data.baseSalary,
      joiningDate: data.joiningDate,
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export function updateEmployee(id: string, data: UpdateEmployeeInput) {
  return prisma.employee.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.designation !== undefined ? { designation: data.designation } : {}),
      ...(data.baseSalary !== undefined ? { baseSalary: data.baseSalary } : {}),
      ...(data.joiningDate !== undefined ? { joiningDate: data.joiningDate } : {}),
      ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
    },
  });
}

export function deleteEmployee(id: string) {
  return prisma.employee.delete({ where: { id } });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}
