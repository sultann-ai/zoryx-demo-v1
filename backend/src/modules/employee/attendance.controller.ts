import { Request, Response } from "express";
import { AttendanceStatus } from "../../../generated/prisma/client";
import { EmployeeNotFoundError } from "./employee.service";
import * as attendanceService from "./attendance.service";

const VALID_STATUSES = Object.values(AttendanceStatus);

function isValidStatus(status: unknown): status is AttendanceStatus {
  return typeof status === "string" && (VALID_STATUSES as string[]).includes(status);
}

function parseDateOnly(value: unknown): Date | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function parseDateTime(value: unknown): Date | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function markAttendance(req: Request, res: Response) {
  const { employeeId, date, status, checkIn, checkOut, remarks } = req.body ?? {};

  if (typeof employeeId !== "string" || employeeId.trim().length === 0) {
    res.status(400).json({ error: "employeeId is required" });
    return;
  }
  const dateValue = parseDateOnly(date);
  if (!dateValue) {
    res.status(400).json({ error: "date is required and must be in YYYY-MM-DD format" });
    return;
  }
  if (!isValidStatus(status)) {
    res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  let checkInValue: Date | null | undefined;
  if (checkIn !== undefined) {
    if (checkIn === null) {
      checkInValue = null;
    } else {
      checkInValue = parseDateTime(checkIn);
      if (!checkInValue) {
        res.status(400).json({ error: "checkIn must be a valid date-time or null" });
        return;
      }
    }
  }

  let checkOutValue: Date | null | undefined;
  if (checkOut !== undefined) {
    if (checkOut === null) {
      checkOutValue = null;
    } else {
      checkOutValue = parseDateTime(checkOut);
      if (!checkOutValue) {
        res.status(400).json({ error: "checkOut must be a valid date-time or null" });
        return;
      }
    }
  }

  if (remarks !== undefined && remarks !== null && typeof remarks !== "string") {
    res.status(400).json({ error: "remarks must be a string or null" });
    return;
  }

  try {
    const record = await attendanceService.markAttendance({
      employeeId,
      date: dateValue,
      status,
      ...(checkInValue !== undefined ? { checkIn: checkInValue } : {}),
      ...(checkOutValue !== undefined ? { checkOut: checkOutValue } : {}),
      ...(remarks !== undefined ? { remarks } : {}),
    });
    res.status(200).json(record);
  } catch (error) {
    if (error instanceof EmployeeNotFoundError) {
      res.status(400).json({ error: "employeeId does not reference an existing Employee" });
      return;
    }
    throw error;
  }
}

export async function getAttendanceRange(req: Request, res: Response) {
  const { employeeId, startDate, endDate } = req.query;

  if (employeeId !== undefined && typeof employeeId !== "string") {
    res.status(400).json({ error: "employeeId must be a single string value" });
    return;
  }
  const startDateValue = parseDateOnly(startDate);
  if (!startDateValue) {
    res.status(400).json({ error: "startDate is required and must be in YYYY-MM-DD format" });
    return;
  }
  const endDateValue = parseDateOnly(endDate);
  if (!endDateValue) {
    res.status(400).json({ error: "endDate is required and must be in YYYY-MM-DD format" });
    return;
  }
  if (endDateValue.getTime() < startDateValue.getTime()) {
    res.status(400).json({ error: "endDate must not be before startDate" });
    return;
  }

  const records = await attendanceService.getAttendanceRange({
    ...(employeeId !== undefined ? { employeeId } : {}),
    startDate: startDateValue,
    endDate: endDateValue,
  });
  res.json(records);
}
