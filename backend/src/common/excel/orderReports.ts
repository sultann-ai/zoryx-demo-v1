import ExcelJS from "exceljs";
import { Prisma } from "../../../generated/prisma/client";
import { isCountedStatus } from "../../modules/reports/salesDefinitions";

export interface OrderRow {
  orderNumber: number;
  createdAt: Date;
  source: string;
  type: string;
  paymentMethod: string;
  status: string;
  paymentStatus: string;
  discount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
}

const ZERO = new Prisma.Decimal(0);

// Decimal fields are converted to plain numbers only here, at the point of writing
// a spreadsheet cell — every sum leading up to this point is still done with Decimal
// arithmetic, so this is a display-boundary conversion, not a calculation shortcut.
function addOrdersSheet(workbook: ExcelJS.Workbook, sheetName: string, orders: readonly OrderRow[]): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: "Order #", key: "orderNumber", width: 12 },
    { header: "Date", key: "createdAt", width: 20 },
    { header: "Source", key: "source", width: 12 },
    { header: "Type", key: "type", width: 12 },
    { header: "Payment Method", key: "paymentMethod", width: 16 },
    { header: "Status", key: "status", width: 14 },
    { header: "Payment Status", key: "paymentStatus", width: 20 },
    { header: "Discount", key: "discount", width: 12 },
    { header: "Total Amount", key: "totalAmount", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const order of orders) {
    sheet.addRow({
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      source: order.source,
      type: order.type,
      paymentMethod: order.paymentMethod,
      status: order.status,
      paymentStatus: order.paymentStatus,
      discount: order.discount.toNumber(),
      totalAmount: order.totalAmount.toNumber(),
    });
  }

  sheet.getColumn("createdAt").numFmt = "yyyy-mm-dd hh:mm";
  sheet.getColumn("discount").numFmt = "#,##0.00";
  sheet.getColumn("totalAmount").numFmt = "#,##0.00";

  return sheet;
}

export function buildOrdersWorkbook(orders: readonly OrderRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  addOrdersSheet(workbook, "Orders", orders);
  return workbook;
}

export interface DailyReportBusinessDay {
  label: string;
  startedAt: Date;
  endedAt: Date | null;
}

export function buildDailyReportWorkbook(
  businessDay: DailyReportBusinessDay,
  orders: readonly OrderRow[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  // None of CANCELLED (never happened), AWAITING_RECEPTION (not accepted yet) or SCHEDULED
  // (not released yet) counts toward sales or the real order count.
  const awaitingCount = orders.filter((order) => order.status === "AWAITING_RECEPTION").length;
  const scheduledCount = orders.filter((order) => order.status === "SCHEDULED").length;
  const cancelledCount = orders.filter((order) => order.status === "CANCELLED").length;
  const validOrders = orders.filter((order) => isCountedStatus(order.status));
  const totalSales = validOrders.reduce((sum, order) => sum.plus(order.totalAmount), ZERO);

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRows([
    ["Business Day", businessDay.label],
    ["Started At", businessDay.startedAt],
    ["Ended At", businessDay.endedAt ?? "(still active)"],
    ["Order Count", validOrders.length],
    ["Cancelled Count", cancelledCount],
    ["Awaiting Reception Count", awaitingCount],
    ["Scheduled (not released) Count", scheduledCount],
    ["Total Sales", totalSales.toNumber()],
  ]);
  summarySheet.getColumn(1).font = { bold: true };
  summarySheet.getColumn(1).width = 20;
  summarySheet.getColumn(2).width = 24;

  addOrdersSheet(workbook, "Orders", orders);

  return workbook;
}

export interface MonthlyReportRow {
  businessDay: DailyReportBusinessDay;
  totalSales: Prisma.Decimal;
  orderCount: number;
}

export function buildMonthlyReportWorkbook(
  year: number,
  month: number,
  rows: readonly MonthlyReportRow[],
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();

  const totalSales = rows.reduce((sum, row) => sum.plus(row.totalSales), ZERO);
  const totalOrders = rows.reduce((sum, row) => sum + row.orderCount, 0);

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.addRows([
    ["Month", `${year}-${String(month).padStart(2, "0")}`],
    ["Business Days", rows.length],
    ["Total Orders", totalOrders],
    ["Total Sales", totalSales.toNumber()],
  ]);
  summarySheet.getColumn(1).font = { bold: true };
  summarySheet.getColumn(1).width = 20;
  summarySheet.getColumn(2).width = 24;

  const daysSheet = workbook.addWorksheet("Business Days");
  daysSheet.columns = [
    { header: "Business Day", key: "label", width: 24 },
    { header: "Started At", key: "startedAt", width: 20 },
    { header: "Ended At", key: "endedAt", width: 20 },
    { header: "Order Count", key: "orderCount", width: 14 },
    { header: "Total Sales", key: "totalSales", width: 14 },
  ];
  daysSheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    daysSheet.addRow({
      label: row.businessDay.label,
      startedAt: row.businessDay.startedAt,
      endedAt: row.businessDay.endedAt ?? "(still active)",
      orderCount: row.orderCount,
      totalSales: row.totalSales.toNumber(),
    });
  }
  daysSheet.getColumn("totalSales").numFmt = "#,##0.00";

  return workbook;
}
