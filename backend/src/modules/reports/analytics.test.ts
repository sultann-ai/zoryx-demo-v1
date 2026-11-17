import { describe, expect, it } from "vitest";
import { Prisma, StaffRole } from "../../../generated/prisma/client";
import { karachiDate, mondayOf, toKarachiDateParam } from "../../common/pkTime";
import {
  InvalidRangeError,
  buildDaily,
  buildTotals,
  buildWeekday,
  buildWeekly,
  canSeeFinancials,
  resolveRange,
} from "./analytics.service";
import { BusinessDayStat, isSalesOrder, isUnpaidOrder } from "./salesDefinitions";

const D = (value: number | string) => new Prisma.Decimal(value);

function stat(date: string, over: Partial<BusinessDayStat> = {}): BusinessDayStat {
  return {
    businessDayId: `bd-${date}`,
    label: date,
    startedAt: new Date(`${date}T10:00:00Z`),
    endedAt: null,
    date,
    sales: D(0),
    orders: 0,
    cancelledCount: 0,
    cancelledValue: D(0),
    cancelledPaidCount: 0,
    cancelledPaidValue: D(0),
    unpaidCount: 0,
    unpaidValue: D(0),
    cashSales: D(0),
    onlineSales: D(0),
    onlineOrders: 0,
    dineIn: 0,
    takeaway: 0,
    delivery: 0,
    ...over,
  };
}

describe("Pakistan time", () => {
  it("dates an instant by its Karachi day, never UTC", () => {
    // 8:30 PM UTC on the 10th is 1:30 AM on the 11th in Karachi.
    expect(karachiDate(new Date("2026-03-10T20:30:00Z"))).toBe("2026-03-11");
    expect(karachiDate(new Date("2026-03-10T18:59:00Z"))).toBe("2026-03-10");
  });

  it("converts a legacy ISO timestamp parameter to its Karachi date and passes plain dates through", () => {
    expect(toKarachiDateParam("2026-03-10T20:30:00Z")).toBe("2026-03-11");
    expect(toKarachiDateParam("2026-03-10")).toBe("2026-03-10");
    expect(toKarachiDateParam("nonsense")).toBeUndefined();
  });

  it("starts weeks on Monday", () => {
    expect(mondayOf("2026-03-15")).toBe("2026-03-09"); // a Sunday
    expect(mondayOf("2026-03-09")).toBe("2026-03-09");
  });
});

describe("resolveRange", () => {
  it("compares today with yesterday and a range with the equal-length range before it", () => {
    expect(resolveRange("today", "2026-03-10")).toMatchObject({
      from: "2026-03-10",
      to: "2026-03-10",
      days: 1,
      previousFrom: "2026-03-09",
      previousTo: "2026-03-09",
    });
    expect(resolveRange("last7", "2026-03-10")).toMatchObject({
      from: "2026-03-04",
      to: "2026-03-10",
      days: 7,
      previousFrom: "2026-02-25",
      previousTo: "2026-03-03",
    });
    expect(resolveRange("month", "2026-03-10")).toMatchObject({ from: "2026-03-01", days: 10, previousFrom: "2026-02-19" });
  });

  it("rejects a range over 366 days and a reversed range", () => {
    expect(() => resolveRange("custom", "2026-03-10", { from: "2025-01-01", to: "2026-03-10" })).toThrow(InvalidRangeError);
    expect(resolveRange("custom", "2026-03-10", { from: "2025-03-10", to: "2026-03-10" }).days).toBe(366);
    expect(() => resolveRange("custom", "2026-03-10", { from: "2026-03-10", to: "2026-03-09" })).toThrow(InvalidRangeError);
  });
});

describe("daily series", () => {
  it("zero-fills a date that has no business day", () => {
    const stats = [stat("2026-03-10", { sales: D(1500), orders: 2 }), stat("2026-03-12", { sales: D(200), orders: 1 })];
    const daily = buildDaily(stats, [], "2026-03-10", "2026-03-12", false);
    expect(daily.map((p) => [p.date, p.sales, p.orders])).toEqual([
      ["2026-03-10", "1500.00", 2],
      ["2026-03-11", "0.00", 0],
      ["2026-03-12", "200.00", 1],
    ]);
    expect(daily[1]?.averageOrderValue).toBe("0.00");
  });

  it("merges two business days that opened on the same Karachi date", () => {
    const stats = [
      stat("2026-03-10", { sales: D(100), orders: 1 }),
      { ...stat("2026-03-10", { sales: D(300), orders: 1 }), businessDayId: "second" },
    ];
    const [point] = buildDaily(stats, [], "2026-03-10", "2026-03-10", false);
    expect(point).toMatchObject({ sales: "400.00", orders: 2, averageOrderValue: "200.00" });
    expect(point?.businessDayIds).toHaveLength(2);
  });

  it("keeps financial fields out unless asked, and computes net when asked", () => {
    const stats = [stat("2026-03-10", { sales: D(1000), orders: 1, cashSales: D(600), onlineSales: D(400) })];
    const expenses = [{ date: "2026-03-10", amount: D(250) }];
    const [plain] = buildDaily(stats, expenses, "2026-03-10", "2026-03-10", false);
    expect(plain).not.toHaveProperty("cashSales");
    expect(plain).not.toHaveProperty("expenses");
    expect(plain).not.toHaveProperty("net");
    const [full] = buildDaily(stats, expenses, "2026-03-10", "2026-03-10", true);
    expect(full).toMatchObject({ cashSales: "600.00", onlineSales: "400.00", expenses: "250.00", net: "750.00" });
  });
});

describe("totals and comparison", () => {
  it("computes rates and the previous-period totals from the same function", () => {
    const current = [
      stat("2026-03-10", {
        sales: D(1500),
        orders: 3,
        cancelledCount: 1,
        cancelledValue: D(300),
        onlineOrders: 1,
        dineIn: 2,
        takeaway: 1,
      }),
    ];
    const previous = [stat("2026-03-09", { sales: D(1000), orders: 2 })];
    const now = buildTotals(current, [], false);
    const before = buildTotals(previous, [], false);
    expect(now).toMatchObject({
      sales: "1500.00",
      orders: 3,
      averageOrderValue: "500.00",
      cancelledCount: 1,
      cancelledValue: "300.00",
    });
    expect(now.cancellationRate).toBeCloseTo(0.25);
    expect(now.onlineShare).toBeCloseTo(1 / 3);
    expect(before).toMatchObject({ sales: "1000.00", orders: 2, averageOrderValue: "500.00" });
    expect(now).not.toHaveProperty("net");
  });
});

describe("weekly and weekday views", () => {
  it("returns the last 8 Monday-Sunday weeks with week-over-week change", () => {
    // 2026-03-10 is a Tuesday; the current week starts Monday 2026-03-09.
    const stats = [
      stat("2026-03-02", { sales: D(1000), orders: 4 }), // week of 03-02
      stat("2026-03-08", { sales: D(500), orders: 1 }), // Sunday, still the week of 03-02
      stat("2026-03-09", { sales: D(3000), orders: 6 }), // current week
    ];
    const weeks = buildWeekly(stats, "2026-03-10");
    expect(weeks).toHaveLength(8);
    expect(weeks[7]).toMatchObject({
      weekStart: "2026-03-09",
      weekEnd: "2026-03-15",
      revenue: "3000.00",
      orders: 6,
      averageOrderValue: "500.00",
    });
    expect(weeks[6]).toMatchObject({ weekStart: "2026-03-02", revenue: "1500.00", orders: 5 });
    expect(weeks[7]?.revenueChangePct).toBeCloseTo(100);
    expect(weeks[6]?.revenueChangePct).toBeNull(); // the week before had no revenue
    expect(weeks[0]?.weekStart).toBe("2026-01-19");
  });

  it("averages per weekday over the range when it spans 4+ weeks, else over the last 30 days", () => {
    const stats = [
      stat("2026-03-02", { sales: D(100) }),
      stat("2026-03-09", { sales: D(300) }),
      stat("2026-02-16", { sales: D(900) }),
    ];
    // 7-day range: the window is the 30 days ending 2026-03-10, so Monday 02-16 is included.
    const short = buildWeekday(stats, resolveRange("last7", "2026-03-10"));
    expect(short.from).toBe("2026-02-09");
    expect(short.rows.find((r) => r.weekday === 1)).toMatchObject({ averageSales: "433.33", businessDays: 3 });
    // A 30-day range is already 4+ weeks, so the range itself is the window.
    const long = buildWeekday(stats, resolveRange("last30", "2026-03-10"));
    expect(long.from).toBe("2026-02-09");
  });
});

describe("definitions and visibility", () => {
  it("counts an order as a sale only when it is accepted, not cancelled, and paid", () => {
    for (const status of ["PENDING", "CONFIRMED", "IN_KITCHEN", "READY", "COMPLETED"]) {
      expect(isSalesOrder({ status, paymentStatus: "VERIFIED" }), status).toBe(true);
      expect(isUnpaidOrder({ status, paymentStatus: "VERIFIED" }), status).toBe(false);
      for (const paymentStatus of ["PENDING", "AWAITING_VERIFICATION", "REJECTED"]) {
        expect(isSalesOrder({ status, paymentStatus }), `${status}/${paymentStatus}`).toBe(false);
        expect(isUnpaidOrder({ status, paymentStatus }), `${status}/${paymentStatus}`).toBe(true);
      }
    }
    for (const status of ["CANCELLED", "AWAITING_RECEPTION", "SCHEDULED"]) {
      for (const paymentStatus of ["PENDING", "VERIFIED"]) {
        expect(isSalesOrder({ status, paymentStatus }), status).toBe(false);
        expect(isUnpaidOrder({ status, paymentStatus }), status).toBe(false);
      }
    }
  });

  it("shows financial figures only to the two roles that already reach Reports", () => {
    expect(canSeeFinancials(StaffRole.SUPER_ADMIN)).toBe(true);
    expect(canSeeFinancials(StaffRole.POS_ADMIN)).toBe(true);
    for (const role of [StaffRole.ONLINE_ADMIN, StaffRole.KITCHEN, StaffRole.ORDER_TAKER, undefined]) {
      expect(canSeeFinancials(role)).toBe(false);
    }
  });
});
