import { Request, Response } from "express";
import { buildDailyReportWorkbook, buildMonthlyReportWorkbook } from "../../common/excel/orderReports";
import { sendWorkbookAsXlsx } from "../../common/excel/sendWorkbook";
import { toKarachiDateParam } from "../../common/pkTime";
import * as analyticsService from "./analytics.service";
import * as reportsService from "./reports.service";

function isOneOf<T extends string>(value: unknown, options: readonly T[]): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

export async function getDashboard(_req: Request, res: Response) {
  try {
    const dashboard = await reportsService.getDashboard();
    res.json(dashboard);
  } catch (error) {
    if (error instanceof reportsService.NoActiveBusinessDayError) {
      res.status(404).json({ error: "No active business day" });
      return;
    }
    throw error;
  }
}

export async function getSalesReport(req: Request, res: Response) {
  const { from, to, groupBy } = req.query;

  const fromDate = toKarachiDateParam(from);
  if (!fromDate) {
    res.status(400).json({ error: "from is required and must be a valid date" });
    return;
  }
  const toDate = toKarachiDateParam(to);
  if (!toDate) {
    res.status(400).json({ error: "to is required and must be a valid date" });
    return;
  }
  if (toDate < fromDate) {
    res.status(400).json({ error: "to must not be before from" });
    return;
  }

  let resolvedGroupBy: "day" | "month" = "day";
  if (groupBy !== undefined) {
    if (!isOneOf(groupBy, ["day", "month"] as const)) {
      res.status(400).json({ error: "groupBy must be one of: day, month" });
      return;
    }
    resolvedGroupBy = groupBy;
  }

  const report = await reportsService.getSalesReport({ from: fromDate, to: toDate, groupBy: resolvedGroupBy });
  res.json(report);
}

export async function exportReport(req: Request, res: Response) {
  const { type, businessDayId } = req.query;

  if (!isOneOf(type, ["daily", "monthly"] as const)) {
    res.status(400).json({ error: "type must be one of: daily, monthly" });
    return;
  }
  if (typeof businessDayId !== "string" || businessDayId.trim().length === 0) {
    res.status(400).json({ error: "businessDayId is required" });
    return;
  }

  try {
    if (type === "daily") {
      const { businessDay, orders } = await reportsService.getDailyExportData(businessDayId);
      const workbook = buildDailyReportWorkbook(businessDay, orders);
      await sendWorkbookAsXlsx(res, workbook, `daily-report-${businessDay.label}.xlsx`);
      return;
    }

    const { year, month, rows } = await reportsService.getMonthlyExportData(businessDayId);
    const workbook = buildMonthlyReportWorkbook(year, month, rows);
    await sendWorkbookAsXlsx(res, workbook, `monthly-report-${year}-${String(month).padStart(2, "0")}.xlsx`);
  } catch (error) {
    if (error instanceof reportsService.BusinessDayNotFoundError) {
      res.status(404).json({ error: "Business day not found" });
      return;
    }
    throw error;
  }
}

export async function getAnalytics(req: Request, res: Response) {
  const { period, from, to } = req.query;
  if (!isOneOf(period, analyticsService.PERIODS)) {
    res.status(400).json({ error: `period must be one of: ${analyticsService.PERIODS.join(", ")}` });
    return;
  }

  let custom: { from: string; to: string } | undefined;
  if (period === "custom") {
    const fromDate = toKarachiDateParam(from);
    const toDate = toKarachiDateParam(to);
    if (!fromDate || !toDate) {
      res.status(400).json({ error: "from and to are required for a custom range" });
      return;
    }
    custom = { from: fromDate, to: toDate };
  }

  try {
    const analytics = await analyticsService.getAnalytics({
      period,
      custom,
      includeFinancials: analyticsService.canSeeFinancials(req.staff?.role),
    });
    res.json(analytics);
  } catch (error) {
    if (error instanceof analyticsService.InvalidRangeError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
}
