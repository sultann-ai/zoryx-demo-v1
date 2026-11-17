import { Prisma, StaffRole } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import {
  addDays,
  diffDays,
  eachDate,
  firstOfMonth,
  isoWeekday,
  karachiDate,
  mondayOf,
} from "../../common/pkTime";
import {
  BusinessDayStat,
  Db,
  SQL_CANCELLED,
  SQL_COUNTED,
  SQL_OPEN_DATE,
  fetchBusinessDayStats,
  sqlKarachi,
} from "./salesDefinitions";

export const MAX_RANGE_DAYS = 366;
export const WEEKS_SHOWN = 8;
const ZERO = new Prisma.Decimal(0);

export type Period = "today" | "yesterday" | "last7" | "last30" | "month" | "custom";
export const PERIODS: readonly Period[] = ["today", "yesterday", "last7", "last30", "month", "custom"];

export class InvalidRangeError extends Error {}

// Cash/online split, expenses and net are financial figures. Today the Reports/Dashboard
// router only admits these two roles, so they are the only ones that ever see money beyond
// sales; the check is repeated here so the service itself never leaks them to anyone else.
export function canSeeFinancials(role: StaffRole | undefined): boolean {
  return role === StaffRole.SUPER_ADMIN || role === StaffRole.POS_ADMIN;
}

// ---------- Range resolution ----------

export interface ResolvedRange {
  from: string;
  to: string;
  days: number;
  previousFrom: string;
  previousTo: string;
}

export function resolveRange(period: Period, today: string, custom?: { from: string; to: string }): ResolvedRange {
  let from: string;
  let to: string;
  switch (period) {
    case "today":
      from = to = today;
      break;
    case "yesterday":
      from = to = addDays(today, -1);
      break;
    case "last7":
      from = addDays(today, -6);
      to = today;
      break;
    case "last30":
      from = addDays(today, -29);
      to = today;
      break;
    case "month":
      from = firstOfMonth(today);
      to = today;
      break;
    case "custom":
      if (!custom) {
        throw new InvalidRangeError("from and to are required for a custom range");
      }
      ({ from, to } = custom);
      break;
  }
  if (to < from) {
    throw new InvalidRangeError("to must not be before from");
  }
  const days = diffDays(from, to) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new InvalidRangeError(`Range must be at most ${MAX_RANGE_DAYS} days`);
  }
  const previousTo = addDays(from, -1);
  return { from, to, days, previousFrom: addDays(previousTo, -(days - 1)), previousTo };
}

// ---------- Result shapes (money as strings) ----------

export interface DayPoint {
  date: string;
  businessDayIds: string[];
  sales: string;
  orders: number;
  averageOrderValue: string;
  cancelledCount: number;
  cancelledValue: string;
  cashSales?: string;
  onlineSales?: string;
  expenses?: string;
  net?: string;
}

export interface Totals {
  sales: string;
  orders: number;
  averageOrderValue: string;
  cancelledCount: number;
  cancelledValue: string;
  // cancelled / (counted + cancelled), 0..1
  cancellationRate: number;
  onlineOrders: number;
  onlineShare: number;
  dineIn: number;
  takeaway: number;
  delivery: number;
  businessDays: number;
  cashSales?: string;
  onlineSales?: string;
  expenses?: string;
  net?: string;
}

export interface HourPoint {
  hour: number;
  sales: string;
  orders: number;
}

export interface BreakdownRow {
  key: string;
  orders: number;
  sales: string;
  previousOrders: number;
  previousSales: string;
}

export interface CategoryRow {
  name: string;
  revenue: string;
  quantity: number;
  previousRevenue: string;
  previousQuantity: number;
}

export interface ItemRow {
  menuItemId: string;
  name: string;
  revenue: string;
  quantity: number;
  previousRevenue: string;
  previousQuantity: number;
}

export interface WeekRow {
  weekStart: string;
  weekEnd: string;
  revenue: string;
  orders: number;
  averageOrderValue: string;
  // Percent change of revenue vs the week before; null when that week had no revenue.
  revenueChangePct: number | null;
}

export interface WeekdayRow {
  weekday: number; // 1 = Monday ... 7 = Sunday
  averageSales: string;
  businessDays: number;
}

export interface Analytics {
  period: Period;
  range: ResolvedRange;
  generatedAt: string;
  activeBusinessDay: { id: string; label: string } | null;
  financials: boolean;
  totals: Totals;
  previousTotals: Totals;
  daily: DayPoint[];
  previousDaily: DayPoint[];
  hourly: HourPoint[];
  previousHourly: HourPoint[];
  breakdowns: { orderType: BreakdownRow[]; source: BreakdownRow[]; payment?: BreakdownRow[] };
  categories: CategoryRow[];
  topItemsByRevenue: ItemRow[];
  topItemsByQuantity: ItemRow[];
  cancelledReasons: { reason: string; count: number; value: string }[];
  weekly: WeekRow[];
  weekday: { from: string; to: string; rows: WeekdayRow[] };
}

// ---------- Pure assembly from per-business-day rows ----------

export interface ExpenseRow {
  date: string;
  amount: Prisma.Decimal;
}

function sum(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce((acc, value) => acc.plus(value), ZERO);
}

function avg(sales: Prisma.Decimal, orders: number): Prisma.Decimal {
  return orders > 0 ? sales.div(orders) : ZERO;
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

// One point per calendar date in [from, to] — dates with no business day are zeros.
export function buildDaily(
  stats: BusinessDayStat[],
  expenses: ExpenseRow[],
  from: string,
  to: string,
  financials: boolean,
): DayPoint[] {
  return eachDate(from, to).map((date) => {
    const rows = stats.filter((stat) => stat.date === date);
    const sales = sum(rows.map((row) => row.sales));
    const orders = rows.reduce((total, row) => total + row.orders, 0);
    const point: DayPoint = {
      date,
      businessDayIds: rows.map((row) => row.businessDayId),
      sales: money(sales),
      orders,
      averageOrderValue: money(avg(sales, orders)),
      cancelledCount: rows.reduce((total, row) => total + row.cancelledCount, 0),
      cancelledValue: money(sum(rows.map((row) => row.cancelledValue))),
    };
    if (financials) {
      const spent = sum(expenses.filter((expense) => expense.date === date).map((expense) => expense.amount));
      point.cashSales = money(sum(rows.map((row) => row.cashSales)));
      point.onlineSales = money(sum(rows.map((row) => row.onlineSales)));
      point.expenses = money(spent);
      point.net = money(sales.minus(spent));
    }
    return point;
  });
}

export function buildTotals(stats: BusinessDayStat[], expenses: ExpenseRow[], financials: boolean): Totals {
  const sales = sum(stats.map((stat) => stat.sales));
  const orders = stats.reduce((total, stat) => total + stat.orders, 0);
  const cancelledCount = stats.reduce((total, stat) => total + stat.cancelledCount, 0);
  const onlineOrders = stats.reduce((total, stat) => total + stat.onlineOrders, 0);
  const totals: Totals = {
    sales: money(sales),
    orders,
    averageOrderValue: money(avg(sales, orders)),
    cancelledCount,
    cancelledValue: money(sum(stats.map((stat) => stat.cancelledValue))),
    cancellationRate: orders + cancelledCount > 0 ? cancelledCount / (orders + cancelledCount) : 0,
    onlineOrders,
    onlineShare: orders > 0 ? onlineOrders / orders : 0,
    dineIn: stats.reduce((total, stat) => total + stat.dineIn, 0),
    takeaway: stats.reduce((total, stat) => total + stat.takeaway, 0),
    delivery: stats.reduce((total, stat) => total + stat.delivery, 0),
    businessDays: stats.length,
  };
  if (financials) {
    const spent = sum(expenses.map((expense) => expense.amount));
    totals.cashSales = money(sum(stats.map((stat) => stat.cashSales)));
    totals.onlineSales = money(sum(stats.map((stat) => stat.onlineSales)));
    totals.expenses = money(spent);
    totals.net = money(sales.minus(spent));
  }
  return totals;
}

const inRange = (stat: BusinessDayStat, from: string, to: string) => stat.date >= from && stat.date <= to;

// Last 8 Monday-to-Sunday weeks ending with the week containing `today` (that one is partial).
export function buildWeekly(stats: BusinessDayStat[], today: string): WeekRow[] {
  const currentMonday = mondayOf(today);
  const starts = Array.from({ length: WEEKS_SHOWN + 1 }, (_, i) => addDays(currentMonday, -7 * (WEEKS_SHOWN - i)));
  const weeks = starts.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    const rows = stats.filter((stat) => inRange(stat, weekStart, weekEnd));
    const revenue = sum(rows.map((row) => row.sales));
    const orders = rows.reduce((total, row) => total + row.orders, 0);
    return { weekStart, weekEnd, revenue, orders };
  });
  // starts[0] is only there to give the oldest shown week something to compare against.
  return weeks.slice(1).map((week, index) => {
    const before = weeks[index];
    return {
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      revenue: money(week.revenue),
      orders: week.orders,
      averageOrderValue: money(avg(week.revenue, week.orders)),
      revenueChangePct:
        before && before.revenue.gt(0) ? week.revenue.minus(before.revenue).div(before.revenue).times(100).toNumber() : null,
    };
  });
}

// Average sales per business day, for each weekday. Windows shorter than four weeks fall back to
// the 30 days ending at the range's end.
export function buildWeekday(stats: BusinessDayStat[], range: ResolvedRange): { from: string; to: string; rows: WeekdayRow[] } {
  const from = range.days >= 28 ? range.from : addDays(range.to, -29);
  const rows: WeekdayRow[] = [];
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const matching = stats.filter((stat) => inRange(stat, from, range.to) && isoWeekday(stat.date) === weekday);
    // Several business days can open on one date; average per date that had a business day.
    const dates = new Set(matching.map((stat) => stat.date));
    const total = sum(matching.map((stat) => stat.sales));
    rows.push({ weekday, averageSales: money(avg(total, dates.size)), businessDays: dates.size });
  }
  return { from, to: range.to, rows };
}

// ---------- Database reads ----------

function dateFilter(from: string, to: string) {
  return Prisma.sql`${SQL_OPEN_DATE} BETWEEN ${from}::date AND ${to}::date`;
}

async function fetchExpenses(db: Db, from: string, to: string): Promise<ExpenseRow[]> {
  const rows = await db.$queryRaw<{ date: string; amount: Prisma.Decimal }[]>(Prisma.sql`
    SELECT to_char(${sqlKarachi(Prisma.sql`e."date"`)}::date, 'YYYY-MM-DD') AS "date",
           SUM(e."amount") AS "amount"
    FROM "VendorLedgerEntry" e
    WHERE e."type" = 'PURCHASE'
      AND ${sqlKarachi(Prisma.sql`e."date"`)}::date BETWEEN ${from}::date AND ${to}::date
    GROUP BY 1
  `);
  return rows.map((row) => ({ date: row.date, amount: new Prisma.Decimal(row.amount) }));
}

async function fetchHourly(db: Db, from: string, to: string): Promise<HourPoint[]> {
  const rows = await db.$queryRaw<{ hour: number; sales: Prisma.Decimal; orders: number }[]>(Prisma.sql`
    SELECT EXTRACT(HOUR FROM ${sqlKarachi(Prisma.sql`o."createdAt"`)})::int AS "hour",
           SUM(o."totalAmount") AS "sales",
           COUNT(*)::int AS "orders"
    FROM "Order" o JOIN "BusinessDay" bd ON bd."id" = o."businessDayId"
    WHERE ${SQL_COUNTED} AND ${dateFilter(from, to)}
    GROUP BY 1
  `);
  return Array.from({ length: 24 }, (_, hour) => {
    const row = rows.find((candidate) => candidate.hour === hour);
    return { hour, sales: money(new Prisma.Decimal(row?.sales ?? 0)), orders: row?.orders ?? 0 };
  });
}

interface RawBreakdown {
  type: string | null;
  source: string | null;
  payment: string | null;
  orders: number;
  sales: Prisma.Decimal;
}

async function fetchBreakdowns(db: Db, from: string, to: string) {
  const rows = await db.$queryRaw<RawBreakdown[]>(Prisma.sql`
    SELECT o."type"::text AS "type", o."source"::text AS "source", o."paymentMethod"::text AS "payment",
           COUNT(*)::int AS "orders", SUM(o."totalAmount") AS "sales"
    FROM "Order" o JOIN "BusinessDay" bd ON bd."id" = o."businessDayId"
    WHERE ${SQL_COUNTED} AND ${dateFilter(from, to)}
    GROUP BY GROUPING SETS ((o."type"), (o."source"), (o."paymentMethod"))
  `);
  const pick = (field: "type" | "source" | "payment") =>
    new Map(rows.filter((row) => row[field] !== null).map((row) => [row[field] as string, row]));
  return { orderType: pick("type"), source: pick("source"), payment: pick("payment") };
}

function mergeBreakdown(
  keys: string[],
  current: Map<string, RawBreakdown>,
  previous: Map<string, RawBreakdown>,
): BreakdownRow[] {
  const all = [...new Set([...keys, ...current.keys(), ...previous.keys()])];
  return all.map((key) => ({
    key,
    orders: current.get(key)?.orders ?? 0,
    sales: money(new Prisma.Decimal(current.get(key)?.sales ?? 0)),
    previousOrders: previous.get(key)?.orders ?? 0,
    previousSales: money(new Prisma.Decimal(previous.get(key)?.sales ?? 0)),
  }));
}

interface RawCategory {
  name: string;
  period: "current" | "previous";
  revenue: Prisma.Decimal;
  quantity: number;
}

// Revenue is the line subtotal. Deal-exploded rows carry no price of their own (the deal line
// does), so a deal's revenue is its own "Deals" bucket and exploded rows are not counted twice.
async function fetchCategories(db: Db, range: ResolvedRange): Promise<CategoryRow[]> {
  const periodCase = Prisma.sql`CASE WHEN ${SQL_OPEN_DATE} >= ${range.from}::date THEN 'current' ELSE 'previous' END`;
  const rows = await db.$queryRaw<RawCategory[]>(Prisma.sql`
    SELECT name, period, SUM(revenue) AS "revenue", SUM(quantity)::int AS "quantity" FROM (
      SELECT COALESCE(c."name", 'Uncategorised') AS name, ${periodCase} AS period,
             oi."subtotal" AS revenue, oi."quantity" AS quantity
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      JOIN "BusinessDay" bd ON bd."id" = o."businessDayId"
      JOIN "MenuItem" mi ON mi."id" = oi."menuItemId"
      LEFT JOIN "Category" c ON c."id" = mi."categoryId"
      WHERE ${SQL_COUNTED} AND oi."dealOrderLineId" IS NULL
        AND ${dateFilter(range.previousFrom, range.to)}
      UNION ALL
      SELECT 'Deals' AS name, ${periodCase} AS period, dl."subtotal" AS revenue, dl."quantity" AS quantity
      FROM "OrderDealLine" dl
      JOIN "Order" o ON o."id" = dl."orderId"
      JOIN "BusinessDay" bd ON bd."id" = o."businessDayId"
      WHERE ${SQL_COUNTED} AND ${dateFilter(range.previousFrom, range.to)}
    ) lines
    GROUP BY name, period
  `);
  const byName = new Map<string, CategoryRow>();
  for (const row of rows) {
    const entry =
      byName.get(row.name) ??
      { name: row.name, revenue: "0.00", quantity: 0, previousRevenue: "0.00", previousQuantity: 0 };
    if (row.period === "current") {
      entry.revenue = money(new Prisma.Decimal(row.revenue));
      entry.quantity = row.quantity;
    } else {
      entry.previousRevenue = money(new Prisma.Decimal(row.revenue));
      entry.previousQuantity = row.quantity;
    }
    byName.set(row.name, entry);
  }
  return [...byName.values()]
    .filter((row) => row.quantity > 0 || row.revenue !== "0.00")
    .sort((a, b) => Number(b.revenue) - Number(a.revenue));
}

interface RawItem {
  menuItemId: string;
  name: string;
  revenue: Prisma.Decimal;
  quantity: number;
}

// Same quantity definition the old dashboard's top-items list used: every non-cancelled order
// item row, deal-exploded rows included (they are what the kitchen actually made). Revenue is
// the row subtotal, so deal-exploded rows add quantity but no revenue.
async function fetchItems(
  db: Db,
  from: string,
  to: string,
  order: "revenue" | "quantity" | { ids: string[] },
): Promise<RawItem[]> {
  if (typeof order === "object" && order.ids.length === 0) {
    return [];
  }
  const orderBy =
    order === "revenue"
      ? Prisma.sql`ORDER BY SUM(oi."subtotal") DESC, SUM(oi."quantity") DESC LIMIT 10`
      : order === "quantity"
        ? Prisma.sql`ORDER BY SUM(oi."quantity") DESC, SUM(oi."subtotal") DESC LIMIT 10`
        : Prisma.empty;
  const idFilter =
    typeof order === "object" ? Prisma.sql`AND oi."menuItemId" IN (${Prisma.join(order.ids)})` : Prisma.empty;
  const rows = await db.$queryRaw<RawItem[]>(Prisma.sql`
    SELECT oi."menuItemId" AS "menuItemId", mi."name" AS "name",
           SUM(oi."subtotal") AS "revenue", SUM(oi."quantity")::int AS "quantity"
    FROM "OrderItem" oi
    JOIN "Order" o ON o."id" = oi."orderId"
    JOIN "BusinessDay" bd ON bd."id" = o."businessDayId"
    JOIN "MenuItem" mi ON mi."id" = oi."menuItemId"
    WHERE ${SQL_COUNTED} AND ${dateFilter(from, to)} ${idFilter}
    GROUP BY oi."menuItemId", mi."name"
    ${orderBy}
  `);
  return rows;
}

async function fetchCancelledReasons(db: Db, from: string, to: string) {
  const rows = await db.$queryRaw<{ reason: string; count: number; value: Prisma.Decimal }[]>(Prisma.sql`
    SELECT COALESCE(NULLIF(TRIM(o."cancelledReason"), ''), 'No reason given') AS "reason",
           COUNT(*)::int AS "count", SUM(o."totalAmount") AS "value"
    FROM "Order" o JOIN "BusinessDay" bd ON bd."id" = o."businessDayId"
    WHERE ${SQL_CANCELLED} AND ${dateFilter(from, to)}
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT 8
  `);
  return rows.map((row) => ({ reason: row.reason, count: row.count, value: money(new Prisma.Decimal(row.value)) }));
}

export interface AnalyticsParams {
  period: Period;
  custom?: { from: string; to: string } | undefined;
  includeFinancials: boolean;
  now?: Date;
}

export async function getAnalytics(params: AnalyticsParams, db: Db = prisma): Promise<Analytics> {
  const activeRows = await db.$queryRaw<{ id: string; label: string; date: string }[]>(Prisma.sql`
    SELECT bd."id" AS "id", bd."label" AS "label", to_char(${SQL_OPEN_DATE}, 'YYYY-MM-DD') AS "date"
    FROM "BusinessDay" bd WHERE bd."isActive" = true ORDER BY bd."startedAt" DESC LIMIT 1
  `);
  const active = activeRows[0] ?? null;

  // "Today" is the active business day's date (it may have opened before midnight), or the
  // Karachi calendar date when none is open.
  const today = active?.date ?? karachiDate(params.now ?? new Date());
  const range = resolveRange(params.period, today, params.custom);
  const financials = params.includeFinancials;

  // Reach back far enough for the previous period, the 8-week view and the weekday window.
  const weeksFrom = addDays(mondayOf(today), -7 * WEEKS_SHOWN);
  const weekdayFrom = range.days >= 28 ? range.from : addDays(range.to, -29);
  const earliest = [range.previousFrom, weeksFrom, weekdayFrom].sort()[0] as string;
  const latest = [range.to, today].sort().reverse()[0] as string;

  const [
    allStats,
    expenses,
    hourly,
    previousHourly,
    breakdowns,
    previousBreakdowns,
    categories,
    topRevenue,
    topQuantity,
    cancelledReasons,
  ] = await Promise.all([
    fetchBusinessDayStats(db, { from: earliest, to: latest }),
    financials ? fetchExpenses(db, range.previousFrom, range.to) : Promise.resolve([] as ExpenseRow[]),
    fetchHourly(db, range.from, range.to),
    fetchHourly(db, range.previousFrom, range.previousTo),
    fetchBreakdowns(db, range.from, range.to),
    fetchBreakdowns(db, range.previousFrom, range.previousTo),
    fetchCategories(db, range),
    fetchItems(db, range.from, range.to, "revenue"),
    fetchItems(db, range.from, range.to, "quantity"),
    fetchCancelledReasons(db, range.from, range.to),
  ]);

  const currentStats = allStats.filter((stat) => inRange(stat, range.from, range.to));
  const previousStats = allStats.filter((stat) => inRange(stat, range.previousFrom, range.previousTo));
  const currentExpenses = expenses.filter((row) => row.date >= range.from && row.date <= range.to);
  const previousExpenses = expenses.filter((row) => row.date >= range.previousFrom && row.date <= range.previousTo);

  const itemIds = [...new Set([...topRevenue, ...topQuantity].map((item) => item.menuItemId))];
  const previousItems = new Map(
    (await fetchItems(db, range.previousFrom, range.previousTo, { ids: itemIds })).map((item) => [item.menuItemId, item]),
  );
  const toItemRow = (item: RawItem): ItemRow => ({
    menuItemId: item.menuItemId,
    name: item.name,
    revenue: money(new Prisma.Decimal(item.revenue)),
    quantity: item.quantity,
    previousRevenue: money(new Prisma.Decimal(previousItems.get(item.menuItemId)?.revenue ?? 0)),
    previousQuantity: previousItems.get(item.menuItemId)?.quantity ?? 0,
  });

  return {
    period: params.period,
    range,
    generatedAt: new Date().toISOString(),
    activeBusinessDay: active ? { id: active.id, label: active.label } : null,
    financials,
    totals: buildTotals(currentStats, currentExpenses, financials),
    previousTotals: buildTotals(previousStats, previousExpenses, financials),
    daily: buildDaily(allStats, currentExpenses, range.from, range.to, financials),
    previousDaily: buildDaily(allStats, previousExpenses, range.previousFrom, range.previousTo, financials),
    hourly,
    previousHourly,
    breakdowns: {
      orderType: mergeBreakdown(["DINE_IN", "TAKEAWAY", "DELIVERY"], breakdowns.orderType, previousBreakdowns.orderType),
      source: mergeBreakdown([], breakdowns.source, previousBreakdowns.source),
      ...(financials
        ? { payment: mergeBreakdown(["CASH", "ONLINE"], breakdowns.payment, previousBreakdowns.payment) }
        : {}),
    },
    categories,
    topItemsByRevenue: topRevenue.map(toItemRow),
    topItemsByQuantity: topQuantity.map(toItemRow),
    cancelledReasons,
    weekly: buildWeekly(allStats, today),
    weekday: buildWeekday(allStats, range),
  };
}
