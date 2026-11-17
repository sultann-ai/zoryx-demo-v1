import { Request, Response } from "express";
import { Prisma } from "../../../generated/prisma/client";
import * as employeeService from "./employee.service";

function parseDecimal(value: unknown): Prisma.Decimal | undefined {
  if (typeof value !== "string" && typeof value !== "number") {
    return undefined;
  }
  try {
    return new Prisma.Decimal(value);
  } catch {
    return undefined;
  }
}

export async function listEmployees(_req: Request, res: Response) {
  const employees = await employeeService.listEmployees();
  res.json(employees);
}

export async function getEmployee(req: Request, res: Response) {
  const employee = await employeeService.getEmployeeById(req.params.id as string);
  if (!employee) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  res.json(employee);
}

export async function createEmployee(req: Request, res: Response) {
  const { name, phone, designation, baseSalary, joiningDate, isActive } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof designation !== "string" || designation.trim().length === 0) {
    res.status(400).json({ error: "designation is required" });
    return;
  }
  if (phone !== undefined && typeof phone !== "string") {
    res.status(400).json({ error: "phone must be a string" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  const baseSalaryDecimal = parseDecimal(baseSalary);
  if (!baseSalaryDecimal || baseSalaryDecimal.isNaN() || baseSalaryDecimal.isNegative()) {
    res.status(400).json({ error: "baseSalary is required and must be a non-negative number" });
    return;
  }

  if (typeof joiningDate !== "string") {
    res.status(400).json({ error: "joiningDate is required" });
    return;
  }
  const joiningDateValue = new Date(joiningDate);
  if (Number.isNaN(joiningDateValue.getTime())) {
    res.status(400).json({ error: "joiningDate must be a valid date" });
    return;
  }

  const employee = await employeeService.createEmployee({
    name: name.trim(),
    designation: designation.trim(),
    baseSalary: baseSalaryDecimal,
    joiningDate: joiningDateValue,
    ...(phone !== undefined ? { phone } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  });
  res.status(201).json(employee);
}

export async function updateEmployee(req: Request, res: Response) {
  const { name, phone, designation, baseSalary, joiningDate, isActive } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (designation !== undefined && (typeof designation !== "string" || designation.trim().length === 0)) {
    res.status(400).json({ error: "designation must be a non-empty string" });
    return;
  }
  if (phone !== undefined && phone !== null && typeof phone !== "string") {
    res.status(400).json({ error: "phone must be a string or null" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }

  let baseSalaryDecimal: Prisma.Decimal | undefined;
  if (baseSalary !== undefined) {
    baseSalaryDecimal = parseDecimal(baseSalary);
    if (!baseSalaryDecimal || baseSalaryDecimal.isNaN() || baseSalaryDecimal.isNegative()) {
      res.status(400).json({ error: "baseSalary must be a non-negative number" });
      return;
    }
  }

  let joiningDateValue: Date | undefined;
  if (joiningDate !== undefined) {
    if (typeof joiningDate !== "string") {
      res.status(400).json({ error: "joiningDate must be a valid date string" });
      return;
    }
    joiningDateValue = new Date(joiningDate);
    if (Number.isNaN(joiningDateValue.getTime())) {
      res.status(400).json({ error: "joiningDate must be a valid date" });
      return;
    }
  }

  try {
    const employee = await employeeService.updateEmployee(req.params.id as string, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(phone !== undefined ? { phone } : {}),
      ...(designation !== undefined ? { designation: designation.trim() } : {}),
      ...(baseSalaryDecimal !== undefined ? { baseSalary: baseSalaryDecimal } : {}),
      ...(joiningDateValue !== undefined ? { joiningDate: joiningDateValue } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    });
    res.json(employee);
  } catch (error) {
    if (employeeService.isNotFoundError(error)) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    throw error;
  }
}

export async function deleteEmployee(req: Request, res: Response) {
  try {
    await employeeService.deleteEmployee(req.params.id as string);
    res.status(204).send();
  } catch (error) {
    if (employeeService.isNotFoundError(error)) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    if (employeeService.isForeignKeyConstraintError(error)) {
      res.status(409).json({
        error: "Cannot delete employee: attendance or payroll records still reference it",
      });
      return;
    }
    throw error;
  }
}
