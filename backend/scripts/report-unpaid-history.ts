// READ-ONLY. Shows how past reports change now that sales count only paid orders (phase 1, fix 3).
// For every business day it prints the old sales figure (every accepted, not-cancelled order), the
// new one (the same, but paid only), and the unpaid orders that drop out — count and total.
// Changes nothing: one SELECT, inside a read-only transaction.
//
//   npx ts-node scripts/report-unpaid-history.ts
//
// Safe against any database since it only reads, but it prints which host it is reading first.
import dotenv from "dotenv";
dotenv.config();

import { Prisma, PrismaClient } from "../generated/prisma/client";
import { SQL_COUNTED, SQL_OPEN_DATE, SQL_UNPAID } from "../src/modules/reports/salesDefinitions";

interface Row {
  label: string;
  date: string;
  oldOrders: number;
  oldSales: Prisma.Decimal;
  newOrders: number;
  newSales: Prisma.Decimal;
  unpaidOrders: number;
  unpaidTotal: Prisma.Decimal;
}

const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").host;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
})();

const prisma = new PrismaClient();

async function main() {
  console.log(`Reading from ${host} (read-only)\n`);

  // "Old" = the definition before phase 1: status not CANCELLED/AWAITING_RECEPTION/SCHEDULED, paid or not.
  // That is exactly SQL_COUNTED (paid) + SQL_UNPAID (not paid).
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    return tx.$queryRaw<Row[]>(Prisma.sql`
      SELECT
        bd."label" AS "label",
        to_char(${SQL_OPEN_DATE}, 'YYYY-MM-DD') AS "date",
        (COUNT(o."id") FILTER (WHERE ${SQL_COUNTED} OR ${SQL_UNPAID}))::int AS "oldOrders",
        COALESCE(SUM(o."totalAmount") FILTER (WHERE ${SQL_COUNTED} OR ${SQL_UNPAID}), 0) AS "oldSales",
        (COUNT(o."id") FILTER (WHERE ${SQL_COUNTED}))::int AS "newOrders",
        COALESCE(SUM(o."totalAmount") FILTER (WHERE ${SQL_COUNTED}), 0) AS "newSales",
        (COUNT(o."id") FILTER (WHERE ${SQL_UNPAID}))::int AS "unpaidOrders",
        COALESCE(SUM(o."totalAmount") FILTER (WHERE ${SQL_UNPAID}), 0) AS "unpaidTotal"
      FROM "BusinessDay" bd
      LEFT JOIN "Order" o ON o."businessDayId" = bd."id"
      GROUP BY bd."id"
      ORDER BY bd."startedAt" ASC
    `);
  });

  if (rows.length === 0) {
    console.log("No business days.");
    return;
  }

  const money = (value: Prisma.Decimal | string) => new Prisma.Decimal(value).toFixed(2);
  const header = ["Date (PK)", "Business day", "Old orders", "Old sales", "New orders", "New sales", "Unpaid #", "Unpaid total"];
  const table = rows.map((row) => [
    row.date,
    row.label,
    String(row.oldOrders),
    money(row.oldSales),
    String(row.newOrders),
    money(row.newSales),
    String(row.unpaidOrders),
    money(row.unpaidTotal),
  ]);
  const widths = header.map((title, column) => Math.max(title.length, ...table.map((cells) => cells[column]!.length)));
  const line = (cells: string[]) => cells.map((cell, column) => (column < 2 ? cell.padEnd(widths[column]!) : cell.padStart(widths[column]!))).join("  ");
  console.log(line(header));
  console.log(widths.map((width) => "-".repeat(width)).join("  "));
  table.forEach((cells) => console.log(line(cells)));

  const sum = (pick: (row: Row) => Prisma.Decimal) => rows.reduce((total, row) => total.plus(pick(row)), new Prisma.Decimal(0));
  const unpaidDays = rows.filter((row) => row.unpaidOrders > 0).length;
  console.log(
    `\n${rows.length} business day(s); ${unpaidDays} with unpaid orders. ` +
      `Unpaid: ${rows.reduce((total, row) => total + row.unpaidOrders, 0)} order(s), Rs ${money(sum((row) => row.unpaidTotal))}. ` +
      `Sales old Rs ${money(sum((row) => row.oldSales))} -> new Rs ${money(sum((row) => row.newSales))}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
