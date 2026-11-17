import { describe, expect, it, vi } from "vitest";
import { karachiDate, karachiYearMonth } from "./pkTime";
import { isLocalDb, withRollback } from "./testDb";
import { getCurrentMonthPayroll } from "../modules/employee/payroll.service";
import { getAttendanceRange, markAttendance } from "../modules/employee/attendance.service";
import { getMonthlyExportData, getSalesReport } from "../modules/reports/reports.service";

vi.mock("../config/prisma", async () => ({ prisma: (await import("./testDb")).prismaProxy }));

// The month boundary in Pakistan time: 2026-11-30 23:30 PK is 18:30 UTC (still November);
// 2026-12-01 00:30 PK is 19:30 UTC on the 30th (already December, though UTC says November).
const LATE_NOVEMBER = new Date("2026-11-30T18:30:00Z");
const EARLY_DECEMBER = new Date("2026-11-30T19:30:00Z");

describe("Karachi months", () => {
  it("puts 23:30 PK on the 30th in November and 00:30 PK on the 1st in December", () => {
    expect(karachiYearMonth(LATE_NOVEMBER)).toEqual({ year: 2026, month: 11 });
    expect(karachiYearMonth(EARLY_DECEMBER)).toEqual({ year: 2026, month: 12 });
    expect(karachiYearMonth(new Date("2026-12-31T19:00:00Z"))).toEqual({ year: 2027, month: 1 });
  });
});

describe.skipIf(!isLocalDb)("monthly figures use Pakistan months (local DB, rolled back)", () => {
  it("reports: a business day opened at 23:30 PK on Nov 30 is November; one opened at 00:30 PK on Dec 1 is December", async () => {
    const result = await withRollback(async (tx) => {
      const staff = await tx.staffUser.create({ data: { name: "T", username: `pk-${Date.now()}`, passwordHash: "x", role: "SUPER_ADMIN" } });
      const open = async (label: string, at: Date, total: number) => {
        const day = await tx.businessDay.create({ data: { label, startedAt: at, endedAt: at, isActive: false, openedById: staff.id } });
        await tx.order.create({
          data: {
            orderNumber: 1, businessDayId: day.id, source: "POS", type: "TAKEAWAY", paymentMethod: "CASH",
            status: "COMPLETED", paymentStatus: "VERIFIED", totalAmount: total, createdAt: at,
          },
        });
        return day;
      };
      const november = await open(`pk-nov-${Date.now()}`, LATE_NOVEMBER, 100);
      const december = await open(`pk-dec-${Date.now()}`, EARLY_DECEMBER, 200);
      const days = (await getSalesReport({ from: "2026-11-30", to: "2026-12-01", groupBy: "day" }, tx)) as { businessDayId: string; label: string }[];
      return {
        november,
        december,
        days: days.filter((day) => [november.id, december.id].includes(day.businessDayId)).map((day) => day.label),
        novemberExport: await getMonthlyExportData(november.id, tx),
        decemberExport: await getMonthlyExportData(december.id, tx),
      };
    });
    expect(result.days).toEqual([result.november.label, result.december.label]);
    expect(result.novemberExport).toMatchObject({ year: 2026, month: 11 });
    expect(result.decemberExport).toMatchObject({ year: 2026, month: 12 });
    const labels = (rows: { businessDay: { label: string } }[]) => rows.map((row) => row.businessDay.label);
    expect(labels(result.novemberExport.rows)).toContain(result.november.label);
    expect(labels(result.novemberExport.rows)).not.toContain(result.december.label);
    expect(labels(result.decemberExport.rows)).toContain(result.december.label);
    expect(labels(result.decemberExport.rows)).not.toContain(result.november.label);
  });

  it("payroll: 'this month' at 23:30 PK on Nov 30 is November, at 00:30 PK on Dec 1 is December", async () => {
    const [november, december] = await withRollback(async (tx) => {
      const employee = await tx.employee.create({
        data: { name: "PK Payroll Test", designation: "Waiter", baseSalary: 30000, joiningDate: new Date("2026-01-01T00:00:00Z") },
      });
      const mine = (rows: Awaited<ReturnType<typeof getCurrentMonthPayroll>>) => rows.find((row) => row.employeeId === employee.id);
      return [mine(await getCurrentMonthPayroll(LATE_NOVEMBER)), mine(await getCurrentMonthPayroll(EARLY_DECEMBER))];
    });
    expect(november).toMatchObject({ month: 11, year: 2026 });
    expect(december).toMatchObject({ month: 12, year: 2026 });
  });

  it("attendance: the Pakistan date of the moment is the day recorded, and it stays that day", async () => {
    const result = await withRollback(async (tx) => {
      const employee = await tx.employee.create({
        data: { name: "PK Attendance Test", designation: "Cook", baseSalary: 30000, joiningDate: new Date("2026-01-01T00:00:00Z") },
      });
      // The attendance API takes a plain "YYYY-MM-DD"; the grid sends the Pakistan date of now.
      const day = (instant: Date) => new Date(`${karachiDate(instant)}T00:00:00.000Z`);
      await markAttendance({ employeeId: employee.id, date: day(LATE_NOVEMBER), status: "PRESENT" });
      await markAttendance({ employeeId: employee.id, date: day(EARLY_DECEMBER), status: "LEAVE" });
      const range = async (from: string, to: string) =>
        (await getAttendanceRange({ employeeId: employee.id, startDate: new Date(`${from}T00:00:00.000Z`), endDate: new Date(`${to}T00:00:00.000Z`) }))
          .map((record) => [record.date.toISOString().slice(0, 10), record.status]);
      return { november: await range("2026-11-01", "2026-11-30"), december: await range("2026-12-01", "2026-12-31") };
    });
    expect(result.november).toEqual([["2026-11-30", "PRESENT"]]);
    expect(result.december).toEqual([["2026-12-01", "LEAVE"]]);
  });
});
