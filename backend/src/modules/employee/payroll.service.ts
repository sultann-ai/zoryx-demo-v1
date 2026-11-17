import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { requireEmployee } from "./employee.service";

const ZERO = new Prisma.Decimal(0);

export interface UpsertPayrollEntryInput {
  employeeId: string;
  month: number;
  year: number;
  baseSalary?: Prisma.Decimal;
  allowance?: Prisma.Decimal;
  deduction?: Prisma.Decimal;
  advanceTaken?: Prisma.Decimal;
  paidAmount?: Prisma.Decimal;
  paidAt?: Date | null;
  note?: string | null;
}

export async function upsertPayrollEntry(input: UpsertPayrollEntryInput) {
  const employee = await requireEmployee(input.employeeId);

  const existing = await prisma.payrollEntry.findUnique({
    where: {
      employeeId_month_year: { employeeId: input.employeeId, month: input.month, year: input.year },
    },
  });

  const baseSalary = input.baseSalary ?? existing?.baseSalary ?? employee.baseSalary;
  const allowance = input.allowance ?? existing?.allowance ?? ZERO;
  const deduction = input.deduction ?? existing?.deduction ?? ZERO;
  const advanceTaken = input.advanceTaken ?? existing?.advanceTaken ?? ZERO;
  const paidAmount = input.paidAmount ?? existing?.paidAmount ?? ZERO;

  const remainingAmount = baseSalary.plus(allowance).minus(deduction).minus(advanceTaken).minus(paidAmount);

  const sharedData = { baseSalary, allowance, deduction, advanceTaken, paidAmount, remainingAmount };

  return prisma.payrollEntry.upsert({
    where: {
      employeeId_month_year: { employeeId: input.employeeId, month: input.month, year: input.year },
    },
    create: {
      employeeId: input.employeeId,
      month: input.month,
      year: input.year,
      ...sharedData,
      ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
    update: {
      ...sharedData,
      ...(input.paidAt !== undefined ? { paidAt: input.paidAt } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });
}

export async function getCurrentMonthPayroll() {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  const [employees, entries] = await Promise.all([
    prisma.employee.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.payrollEntry.findMany({ where: { month, year } }),
  ]);

  const entryByEmployeeId = new Map(entries.map((entry) => [entry.employeeId, entry]));

  return employees.map((employee) => {
    const entry = entryByEmployeeId.get(employee.id);
    if (entry) {
      return { ...entry, employeeName: employee.name, isProjected: false };
    }
    return {
      id: null,
      employeeId: employee.id,
      employeeName: employee.name,
      month,
      year,
      baseSalary: employee.baseSalary,
      allowance: ZERO,
      deduction: ZERO,
      advanceTaken: ZERO,
      paidAmount: ZERO,
      remainingAmount: employee.baseSalary,
      paidAt: null,
      note: null,
      isProjected: true,
    };
  });
}
