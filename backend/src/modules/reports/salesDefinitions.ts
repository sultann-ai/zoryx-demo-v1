import { OrderStatus, Prisma } from "../../../generated/prisma/client";
import { PK_TIME_ZONE } from "../../common/pkTime";

// The ONE place that decides what "sales", "orders" and "cancelled" mean. The dashboard, the
// Reports page, the monthly/daily Excel exports and the analytics endpoint all read from here,
// so they cannot drift apart.
//
//   sales / orders      = orders whose status is NOT in NOT_COUNTED_STATUSES, summed on
//                         Order.totalAmount (items + deals + delivery fee - discount).
//   cancelled           = status CANCELLED (count and totalAmount).
//   cash / online sales = counted orders split on Order.paymentMethod.
//   online orders       = counted orders with source ONLINE.
//   a day               = a BusinessDay, labelled by the Asia/Karachi date it opened.
//
// Not real yet, either way: CANCELLED never happened, AWAITING_RECEPTION hasn't been accepted,
// SCHEDULED hasn't even been released.
export const NOT_COUNTED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.CANCELLED,
  OrderStatus.AWAITING_RECEPTION,
  OrderStatus.SCHEDULED,
];

export function isCountedStatus(status: string): boolean {
  return !(NOT_COUNTED_STATUSES as readonly string[]).includes(status);
}

// SQL fragments (the status list is a code constant, never user input).
const NOT_COUNTED_LIST = Prisma.raw(NOT_COUNTED_STATUSES.map((status) => `'${status}'`).join(", "));
export const SQL_COUNTED = Prisma.sql`o."status" NOT IN (${NOT_COUNTED_LIST})`;
export const SQL_CANCELLED = Prisma.sql`o."status" = 'CANCELLED'`;
// Prisma DateTime columns are `timestamp without time zone` holding UTC. `AT TIME ZONE 'UTC'`
// first turns that into a real instant; the second `AT TIME ZONE` then reads it in Karachi.
// (Using only the second would treat the UTC wall-clock as Karachi time and bucket by UTC.)
export const sqlKarachi = (column: Prisma.Sql) => Prisma.sql`((${column} AT TIME ZONE 'UTC') AT TIME ZONE ${PK_TIME_ZONE})`;
export const SQL_OPEN_DATE = Prisma.sql`${sqlKarachi(Prisma.sql`bd."startedAt"`)}::date`;

// Prisma client or an interactive-transaction client — lets tests run inside a rolled-back
// transaction.
export type Db = Pick<Prisma.TransactionClient, "$queryRaw">;

export interface BusinessDayStat {
  businessDayId: string;
  label: string;
  startedAt: Date;
  endedAt: Date | null;
  // Asia/Karachi date the business day opened, "YYYY-MM-DD".
  date: string;
  sales: Prisma.Decimal;
  orders: number;
  cancelledCount: number;
  cancelledValue: Prisma.Decimal;
  cashSales: Prisma.Decimal;
  onlineSales: Prisma.Decimal;
  onlineOrders: number;
  dineIn: number;
  takeaway: number;
  delivery: number;
}

export type StatRange = { from: string; to: string } | { businessDayId: string };

interface RawStat {
  businessDayId: string;
  label: string;
  startedAt: Date;
  endedAt: Date | null;
  date: string;
  sales: Prisma.Decimal;
  orders: number;
  cancelledCount: number;
  cancelledValue: Prisma.Decimal;
  cashSales: Prisma.Decimal;
  onlineSales: Prisma.Decimal;
  onlineOrders: number;
  dineIn: number;
  takeaway: number;
  delivery: number;
}

// One row per business day (including days with no orders), aggregated in the database.
export async function fetchBusinessDayStats(db: Db, range: StatRange): Promise<BusinessDayStat[]> {
  const where =
    "businessDayId" in range
      ? Prisma.sql`bd."id" = ${range.businessDayId}`
      : Prisma.sql`${SQL_OPEN_DATE} BETWEEN ${range.from}::date AND ${range.to}::date`;

  const rows = await db.$queryRaw<RawStat[]>(Prisma.sql`
    SELECT
      bd."id" AS "businessDayId",
      bd."label" AS "label",
      bd."startedAt" AS "startedAt",
      bd."endedAt" AS "endedAt",
      to_char(${SQL_OPEN_DATE}, 'YYYY-MM-DD') AS "date",
      COALESCE(SUM(o."totalAmount") FILTER (WHERE ${SQL_COUNTED}), 0) AS "sales",
      (COUNT(o."id") FILTER (WHERE ${SQL_COUNTED}))::int AS "orders",
      (COUNT(o."id") FILTER (WHERE ${SQL_CANCELLED}))::int AS "cancelledCount",
      COALESCE(SUM(o."totalAmount") FILTER (WHERE ${SQL_CANCELLED}), 0) AS "cancelledValue",
      COALESCE(SUM(o."totalAmount") FILTER (WHERE ${SQL_COUNTED} AND o."paymentMethod" = 'CASH'), 0) AS "cashSales",
      COALESCE(SUM(o."totalAmount") FILTER (WHERE ${SQL_COUNTED} AND o."paymentMethod" = 'ONLINE'), 0) AS "onlineSales",
      (COUNT(o."id") FILTER (WHERE ${SQL_COUNTED} AND o."source" = 'ONLINE'))::int AS "onlineOrders",
      (COUNT(o."id") FILTER (WHERE ${SQL_COUNTED} AND o."type" = 'DINE_IN'))::int AS "dineIn",
      (COUNT(o."id") FILTER (WHERE ${SQL_COUNTED} AND o."type" = 'TAKEAWAY'))::int AS "takeaway",
      (COUNT(o."id") FILTER (WHERE ${SQL_COUNTED} AND o."type" = 'DELIVERY'))::int AS "delivery"
    FROM "BusinessDay" bd
    LEFT JOIN "Order" o ON o."businessDayId" = bd."id"
    WHERE ${where}
    GROUP BY bd."id"
    ORDER BY bd."startedAt" ASC
  `);

  return rows.map((row) => ({
    ...row,
    sales: new Prisma.Decimal(row.sales),
    cancelledValue: new Prisma.Decimal(row.cancelledValue),
    cashSales: new Prisma.Decimal(row.cashSales),
    onlineSales: new Prisma.Decimal(row.onlineSales),
  }));
}
