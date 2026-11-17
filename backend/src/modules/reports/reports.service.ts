import { OrderStatus, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { firstOfMonth, lastOfMonth } from "../../common/pkTime";
import { Db, SALES_ORDER_WHERE, fetchBusinessDayStats } from "./salesDefinitions";

export class NoActiveBusinessDayError extends Error {}
export class BusinessDayNotFoundError extends Error {}

export interface TopItemRow {
  menuItemId: string;
  name: string;
  quantitySold: number;
}

export async function getDashboard() {
  const activeBusinessDay = await prisma.businessDay.findFirst({ where: { isActive: true } });
  if (!activeBusinessDay) {
    throw new NoActiveBusinessDayError();
  }

  // Same definition as the Reports page and the exports (see salesDefinitions.ts).
  const [stat] = await fetchBusinessDayStats(prisma, { businessDayId: activeBusinessDay.id });
  if (!stat) {
    throw new NoActiveBusinessDayError();
  }
  const awaitingReceptionCount = await prisma.order.count({
    where: { businessDayId: activeBusinessDay.id, status: OrderStatus.AWAITING_RECEPTION },
  });
  const topItemsGrouped = await prisma.orderItem.groupBy({
    by: ["menuItemId"],
    where: { order: { businessDayId: activeBusinessDay.id, ...SALES_ORDER_WHERE } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: 5,
  });

  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: topItemsGrouped.map((group) => group.menuItemId) } },
    select: { id: true, name: true },
  });
  const menuItemNameById = new Map(menuItems.map((item) => [item.id, item.name]));

  const topItems: TopItemRow[] = topItemsGrouped.map((group) => ({
    menuItemId: group.menuItemId,
    name: menuItemNameById.get(group.menuItemId) ?? "Unknown",
    quantitySold: group._sum.quantity ?? 0,
  }));

  return {
    businessDay: activeBusinessDay,
    totalSales: stat.sales,
    orderCount: stat.orders,
    cancelledCount: stat.cancelledCount,
    // Accepted but not paid yet — never part of totalSales.
    unpaidCount: stat.unpaidCount,
    unpaidAmount: stat.unpaidValue,
    cancelledAfterPaymentCount: stat.cancelledPaidCount,
    cancelledAfterPaymentAmount: stat.cancelledPaidValue,
    awaitingReceptionCount,
    topItems,
  };
}

export interface SalesReportParams {
  // Inclusive Asia/Karachi dates, "YYYY-MM-DD" — a business day belongs to the date it opened.
  from: string;
  to: string;
  groupBy: "day" | "month";
}

export interface DaySalesRow {
  businessDayId: string;
  label: string;
  startedAt: Date;
  endedAt: Date | null;
  totalSales: Prisma.Decimal;
  orderCount: number;
}

export interface MonthSalesRow {
  month: string;
  totalSales: Prisma.Decimal;
  orderCount: number;
  businessDayCount: number;
}

export async function getSalesReport(params: SalesReportParams, db: Db = prisma): Promise<DaySalesRow[] | MonthSalesRow[]> {
  const stats = await fetchBusinessDayStats(db, { from: params.from, to: params.to });

  const dayRows: DaySalesRow[] = stats.map((stat) => ({
    businessDayId: stat.businessDayId,
    label: stat.label,
    startedAt: stat.startedAt,
    endedAt: stat.endedAt,
    totalSales: stat.sales,
    orderCount: stat.orders,
  }));

  if (params.groupBy === "day") {
    return dayRows;
  }

  const monthMap = new Map<string, MonthSalesRow>();
  for (const stat of stats) {
    const monthKey = stat.date.slice(0, 7);
    const existing = monthMap.get(monthKey);
    if (existing) {
      existing.totalSales = existing.totalSales.plus(stat.sales);
      existing.orderCount += stat.orders;
      existing.businessDayCount += 1;
    } else {
      monthMap.set(monthKey, {
        month: monthKey,
        totalSales: stat.sales,
        orderCount: stat.orders,
        businessDayCount: 1,
      });
    }
  }

  return [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export async function getDailyExportData(businessDayId: string) {
  const businessDay = await prisma.businessDay.findUnique({ where: { id: businessDayId } });
  if (!businessDay) {
    throw new BusinessDayNotFoundError();
  }

  const orders = await prisma.order.findMany({
    where: { businessDayId },
    orderBy: { orderNumber: "asc" },
  });

  return { businessDay, orders };
}

export async function getMonthlyExportData(anchorBusinessDayId: string, db: Db = prisma) {
  const anchor = await prisma.businessDay.findUnique({ where: { id: anchorBusinessDayId } });
  if (!anchor) {
    throw new BusinessDayNotFoundError();
  }

  // The calendar month (Asia/Karachi) the anchor business day opened in.
  const [anchorStat] = await fetchBusinessDayStats(db, { businessDayId: anchor.id });
  if (!anchorStat) {
    throw new BusinessDayNotFoundError();
  }
  const from = firstOfMonth(anchorStat.date);
  const to = lastOfMonth(anchorStat.date);
  const stats = await fetchBusinessDayStats(db, { from, to });

  const rows = stats.map((stat) => ({
    businessDay: { label: stat.label, startedAt: stat.startedAt, endedAt: stat.endedAt },
    totalSales: stat.sales,
    orderCount: stat.orders,
  }));

  return { year: Number(from.slice(0, 4)), month: Number(from.slice(5, 7)), rows };
}
