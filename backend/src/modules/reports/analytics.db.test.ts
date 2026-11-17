import "../../common/loadEnv";
import { describe, expect, it } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { getAnalytics } from "./analytics.service";
import { getSalesReport } from "./reports.service";

// Runs the real SQL against the local database. Everything is seeded inside one interactive
// transaction that is ALWAYS rolled back, so nothing is left behind. Skipped unless
// DATABASE_URL points at localhost (never touch a remote database from a test). Dates are in
// 2001 so they cannot collide with real business days.
const DATABASE_URL = process.env.DATABASE_URL ?? "";
const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);

class Rollback extends Error {
  constructor(readonly result: unknown) {
    super("rollback");
  }
}

async function inRolledBackTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    await prisma.$transaction(async (tx) => {
      throw new Rollback(await work(tx));
    }, { timeout: 60_000, maxWait: 20_000 });
  } catch (error) {
    if (error instanceof Rollback) {
      return error.result as T;
    }
    throw error;
  }
  throw new Error("transaction unexpectedly committed");
}

const at = (iso: string) => new Date(iso);

async function seed(tx: Prisma.TransactionClient) {
  const staff = await tx.staffUser.create({
    data: { name: "Test", username: `analytics-test-${Date.now()}`, passwordHash: "x", role: "SUPER_ADMIN" },
  });
  const kitchen = await tx.kitchen.create({ data: { name: `K-${Date.now()}` } });
  const category = await tx.category.create({ data: { name: `Cat-${Date.now()}` } });
  const item = await tx.menuItem.create({
    data: { name: "Test Burger", slug: `test-burger-${Date.now()}`, price: 500, kitchenId: kitchen.id, categoryId: category.id },
  });
  const vendor = await tx.vendor.create({ data: { name: "Test Vendor" } });

  const day = (label: string, startedAt: string) =>
    tx.businessDay.create({ data: { label, startedAt: at(startedAt), endedAt: at(startedAt), isActive: false, openedById: staff.id } });

  let counter = 0;
  const order = async (
    businessDayId: string,
    createdAt: string,
    over: Partial<Prisma.OrderUncheckedCreateInput> & { withItem?: boolean } = {},
  ) => {
    const { withItem, ...rest } = over;
    counter += 1;
    return tx.order.create({
      data: {
        orderNumber: counter,
        businessDayId,
        source: "POS",
        type: "DINE_IN",
        paymentMethod: "CASH",
        status: "COMPLETED",
        totalAmount: 0,
        createdAt: at(createdAt),
        ...rest,
        ...(withItem
          ? {
              items: {
                create: [{ menuItemId: item.id, kitchenId: kitchen.id, quantity: 2, unitPrice: 500, subtotal: 1000 }],
              },
            }
          : {}),
      },
    });
  };

  // Previous period (Karachi 2001-03-08): 400 in one order.
  const bd0 = await day("prev", "2001-03-08T10:00:00Z");
  await order(bd0.id, "2001-03-08T10:30:00Z", { totalAmount: 400 });

  // 2001-03-10 (Karachi): 1000 cash dine-in with an item, 500 online takeaway, a cancelled 300,
  // and an awaiting-reception 999 that must not count.
  const bd1 = await day("d1", "2001-03-10T15:00:00Z");
  await order(bd1.id, "2001-03-10T15:30:00Z", { totalAmount: 1000, withItem: true });
  await order(bd1.id, "2001-03-10T16:00:00Z", { totalAmount: 500, source: "ONLINE", type: "TAKEAWAY", paymentMethod: "ONLINE" });
  await order(bd1.id, "2001-03-10T16:30:00Z", { totalAmount: 300, status: "CANCELLED", cancelledReason: "Customer left" });
  await order(bd1.id, "2001-03-10T17:00:00Z", { totalAmount: 999, status: "AWAITING_RECEPTION" });

  // Crosses midnight: opens 02:00 Karachi on 2001-03-11 (that is 21:00 UTC on the 10th, so a UTC
  // bucket would call it the 10th) and takes an order at 03:00 Karachi on the 12th.
  const bd2 = await day("d2", "2001-03-10T21:00:00Z");
  await order(bd2.id, "2001-03-11T22:00:00Z", { totalAmount: 700, type: "DELIVERY" });

  // 2001-03-12 has no business day (the gap). 2001-03-13:
  const bd3 = await day("d3", "2001-03-13T10:00:00Z");
  await order(bd3.id, "2001-03-13T10:30:00Z", { totalAmount: 200 });

  // Opens 01:00 Karachi on 2001-05-01 = 20:00 UTC on 2001-04-30: Karachi month is May, UTC is April.
  const bdMay = await day("may", "2001-04-30T20:00:00Z");
  await order(bdMay.id, "2001-04-30T20:30:00Z", { totalAmount: 50 });

  await tx.vendorLedgerEntry.create({
    data: { vendorId: vendor.id, type: "PURCHASE", amount: 250, date: at("2001-03-10T05:00:00Z"), recordedById: staff.id },
  });
  await tx.vendorLedgerEntry.create({
    data: { vendorId: vendor.id, type: "PAYMENT", amount: 999, date: at("2001-03-10T05:00:00Z"), recordedById: staff.id },
  });
}

const custom = { from: "2001-03-10", to: "2001-03-13" };

describe.skipIf(!isLocal)("analytics against the database (rolled back)", () => {
  it("aggregates a seeded range, zero-fills the gap, buckets in Karachi time and compares with the previous period", async () => {
    const result = await inRolledBackTransaction(async (tx) => {
      await seed(tx);
      return getAnalytics({ period: "custom", custom, includeFinancials: true }, tx);
    });

    expect(result.range).toMatchObject({ from: "2001-03-10", to: "2001-03-13", days: 4, previousFrom: "2001-03-06", previousTo: "2001-03-09" });
    // 1000 + 500 + 700 + 200; the cancelled 300 and awaiting-reception 999 are not sales.
    expect(result.totals).toMatchObject({
      sales: "2400.00",
      orders: 4,
      averageOrderValue: "600.00",
      cancelledCount: 1,
      cancelledValue: "300.00",
      onlineOrders: 1,
      dineIn: 2,
      takeaway: 1,
      delivery: 1,
      businessDays: 3,
      cashSales: "1900.00",
      onlineSales: "500.00",
      expenses: "250.00",
      net: "2150.00",
    });
    expect(result.previousTotals).toMatchObject({ sales: "400.00", orders: 1, expenses: "0.00" });

    expect(result.daily.map((day) => [day.date, day.sales, day.orders, day.cancelledCount])).toEqual([
      ["2001-03-10", "1500.00", 2, 1],
      ["2001-03-11", "700.00", 1, 0], // the midnight-crossing business day stays on its opening date
      ["2001-03-12", "0.00", 0, 0], // gap
      ["2001-03-13", "200.00", 1, 0],
    ]);
    expect(result.previousDaily.find((day) => day.date === "2001-03-08")).toMatchObject({ sales: "400.00" });

    // Hour of day is Karachi time: 15:30Z is 20:30, and the post-midnight order is 03:00.
    expect(result.hourly[20]).toMatchObject({ sales: "1000.00", orders: 1 });
    expect(result.hourly[3]).toMatchObject({ sales: "700.00", orders: 1 });
    expect(result.hourly[4]?.orders).toBe(0);

    expect(result.cancelledReasons).toEqual([{ reason: "Customer left", count: 1, value: "300.00" }]);
    expect(result.breakdowns.payment?.find((row) => row.key === "ONLINE")).toMatchObject({ orders: 1, sales: "500.00" });
    expect(result.breakdowns.orderType.find((row) => row.key === "DELIVERY")).toMatchObject({ orders: 1, sales: "700.00" });
    expect(result.topItemsByQuantity[0]).toMatchObject({ name: "Test Burger", quantity: 2, revenue: "1000.00" });
    expect(result.categories.find((row) => row.revenue === "1000.00")).toMatchObject({ quantity: 2 });
  });

  it("hides cash/online split, expenses and net from a role that may not see them, in the payload itself", async () => {
    const result = await inRolledBackTransaction(async (tx) => {
      await seed(tx);
      return getAnalytics({ period: "custom", custom, includeFinancials: false }, tx);
    });
    const json = JSON.stringify(result);
    expect(result.financials).toBe(false);
    for (const field of ["cashSales", "onlineSales", "expenses", "net"]) {
      expect(json).not.toContain(`"${field}"`);
    }
    expect(result.breakdowns.payment).toBeUndefined();
    expect(result.totals.sales).toBe("2400.00");
  });

  it("has dashboard totals equal to the Reports page totals for the same range", async () => {
    const { analytics, report } = await inRolledBackTransaction(async (tx) => {
      await seed(tx);
      return {
        analytics: await getAnalytics({ period: "custom", custom, includeFinancials: true }, tx),
        report: await getSalesReport({ ...custom, groupBy: "day" }, tx),
      };
    });
    const reportSales = report.reduce((sum, row) => sum.plus(row.totalSales), new Prisma.Decimal(0));
    const reportOrders = report.reduce((sum, row) => sum + row.orderCount, 0);
    expect(analytics.totals.sales).toBe(reportSales.toFixed(2));
    expect(analytics.totals.orders).toBe(reportOrders);
    expect(analytics.daily.reduce((sum, day) => sum.plus(day.sales), new Prisma.Decimal(0)).toFixed(2)).toBe(reportSales.toFixed(2));
  });

  it("groups Reports months by Karachi date, not UTC", async () => {
    const months = await inRolledBackTransaction(async (tx) => {
      await seed(tx);
      return getSalesReport({ from: "2001-03-01", to: "2001-05-31", groupBy: "month" }, tx);
    });
    expect(months.map((row) => [(row as { month: string }).month, row.totalSales.toFixed(2)])).toEqual([
      ["2001-03", "2800.00"],
      ["2001-05", "50.00"], // opened 20:00 UTC on 30 April = 01:00 Karachi on 1 May
    ]);
  });

  it("answers a 30-day range quickly", async () => {
    const started = Date.now();
    await getAnalytics({ period: "last30", includeFinancials: true });
    expect(Date.now() - started).toBeLessThan(1500);
  });
});
