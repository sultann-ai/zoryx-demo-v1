import { Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client";
import { EmployeeNotFoundError } from "./employee.service";
import * as payrollService from "./payroll.service";

type DecimalFieldResult = { ok: true; value: Prisma.Decimal | undefined } | { ok: false; error: string };

function parseDecimalField(value: unknown, fieldName: string): DecimalFieldResult {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return { ok: false, error: `${fieldName} must be a number` };
  }
  let decimal: Prisma.Decimal;
  try {
    decimal = new Prisma.Decimal(value);
  } catch {
    return { ok: false, error: `${fieldName} must be a valid decimal number` };
  }
  if (decimal.isNaN() || decimal.isNegative()) {
    return { ok: false, error: `${fieldName} must be a non-negative number` };
  }
  return { ok: true, value: decimal };
}

export async function upsertPayrollEntry(req: Request, res: Response) {
  const { employeeId, month, year, baseSalary, allowance, deduction, advanceTaken, paidAmount, paidAt, note } =
    req.body ?? {};

  if (typeof employeeId !== "string" || employeeId.trim().length === 0) {
    res.status(400).json({ error: "employeeId is required" });
    return;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    res.status(400).json({ error: "month is required and must be an integer from 1 to 12" });
    return;
  }
  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    res.status(400).json({ error: "year is required and must be a valid 4-digit year" });
    return;
  }

  const baseSalaryResult = parseDecimalField(baseSalary, "baseSalary");
  if (!baseSalaryResult.ok) {
    res.status(400).json({ error: baseSalaryResult.error });
    return;
  }
  const allowanceResult = parseDecimalField(allowance, "allowance");
  if (!allowanceResult.ok) {
    res.status(400).json({ error: allowanceResult.error });
    return;
  }
  const deductionResult = parseDecimalField(deduction, "deduction");
  if (!deductionResult.ok) {
    res.status(400).json({ error: deductionResult.error });
    return;
  }
  const advanceTakenResult = parseDecimalField(advanceTaken, "advanceTaken");
  if (!advanceTakenResult.ok) {
    res.status(400).json({ error: advanceTakenResult.error });
    return;
  }
  const paidAmountResult = parseDecimalField(paidAmount, "paidAmount");
  if (!paidAmountResult.ok) {
    res.status(400).json({ error: paidAmountResult.error });
    return;
  }

  let paidAtValue: Date | null | undefined;
  if (paidAt !== undefined) {
    if (paidAt === null) {
      paidAtValue = null;
    } else if (typeof paidAt === "string") {
      const date = new Date(paidAt);
      if (Number.isNaN(date.getTime())) {
        res.status(400).json({ error: "paidAt must be a valid date-time or null" });
        return;
      }
      paidAtValue = date;
    } else {
      res.status(400).json({ error: "paidAt must be a valid date-time or null" });
      return;
    }
  }

  if (note !== undefined && note !== null && typeof note !== "string") {
    res.status(400).json({ error: "note must be a string or null" });
    return;
  }

  try {
    const entry = await payrollService.upsertPayrollEntry({
      employeeId,
      month,
      year,
      ...(baseSalaryResult.value !== undefined ? { baseSalary: baseSalaryResult.value } : {}),
      ...(allowanceResult.value !== undefined ? { allowance: allowanceResult.value } : {}),
      ...(deductionResult.value !== undefined ? { deduction: deductionResult.value } : {}),
      ...(advanceTakenResult.value !== undefined ? { advanceTaken: advanceTakenResult.value } : {}),
      ...(paidAmountResult.value !== undefined ? { paidAmount: paidAmountResult.value } : {}),
      ...(paidAtValue !== undefined ? { paidAt: paidAtValue } : {}),
      ...(note !== undefined ? { note } : {}),
    });
    res.status(200).json(entry);
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) {
      res.status(400).json({ error: "employeeId does not reference an existing Employee" });
      return;
    }
    throw error;
  }
}

export async function getCurrentMonthPayroll(_req: Request, res: Response) {
  const rows = await payrollService.getCurrentMonthPayroll();
  res.json(rows);
}
