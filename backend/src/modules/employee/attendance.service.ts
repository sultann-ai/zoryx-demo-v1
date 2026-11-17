import { AttendanceStatus } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { requireEmployee } from "./employee.service";

export interface MarkAttendanceInput {
  employeeId: string;
  date: Date;
  status: AttendanceStatus;
  checkIn?: Date | null;
  checkOut?: Date | null;
  remarks?: string | null;
}

export async function markAttendance(input: MarkAttendanceInput) {
  await requireEmployee(input.employeeId);

  return prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date: input.date } },
    create: {
      employeeId: input.employeeId,
      date: input.date,
      status: input.status,
      ...(input.checkIn !== undefined ? { checkIn: input.checkIn } : {}),
      ...(input.checkOut !== undefined ? { checkOut: input.checkOut } : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
    },
    update: {
      status: input.status,
      ...(input.checkIn !== undefined ? { checkIn: input.checkIn } : {}),
      ...(input.checkOut !== undefined ? { checkOut: input.checkOut } : {}),
      ...(input.remarks !== undefined ? { remarks: input.remarks } : {}),
    },
  });
}

export interface AttendanceRangeParams {
  employeeId?: string;
  startDate: Date;
  endDate: Date;
}

export function getAttendanceRange(params: AttendanceRangeParams) {
  return prisma.attendanceRecord.findMany({
    where: {
      date: { gte: params.startDate, lte: params.endDate },
      ...(params.employeeId !== undefined ? { employeeId: params.employeeId } : {}),
    },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: [{ date: "asc" }, { employee: { name: "asc" } }],
  });
}
