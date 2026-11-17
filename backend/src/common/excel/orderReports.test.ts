import { describe, expect, it } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import { OrderRow, buildDailyReportWorkbook } from "./orderReports";

const row = (orderNumber: number, totalAmount: number, status: string, paymentStatus: string): OrderRow => ({
  orderNumber,
  createdAt: new Date("2026-11-17T10:00:00Z"),
  source: "POS",
  type: "DINE_IN",
  paymentMethod: "CASH",
  status,
  paymentStatus,
  discount: new Prisma.Decimal(0),
  totalAmount: new Prisma.Decimal(totalAmount),
});

describe("daily report workbook", () => {
  it("counts only paid orders as sales and shows unpaid ones separately", () => {
    const workbook = buildDailyReportWorkbook({ label: "2026-11-17", startedAt: new Date(), endedAt: null }, [
      row(1, 1000, "COMPLETED", "VERIFIED"),
      row(2, 400, "COMPLETED", "PENDING"),
      row(3, 250, "PENDING", "PENDING"),
      row(4, 300, "CANCELLED", "VERIFIED"),
      row(5, 999, "AWAITING_RECEPTION", "PENDING"),
    ]);
    const summary = new Map<string, unknown>();
    workbook.getWorksheet("Summary")!.eachRow((sheetRow) => {
      summary.set(String(sheetRow.getCell(1).value), sheetRow.getCell(2).value);
    });
    expect(summary.get("Order Count")).toBe(1);
    expect(summary.get("Total Sales")).toBe(1000);
    expect(summary.get("Unpaid Count (not in sales)")).toBe(2);
    expect(summary.get("Unpaid Amount (not in sales)")).toBe(650);
  });
});
