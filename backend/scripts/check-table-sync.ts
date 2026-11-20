// Read-only consistency check for table sync (docs/TABLE_SYNC_SPEC.md §3.2, §3.3, build step 6). Run it before
// deploying the backfill migration (to see what it will do) and before adding the §3.3 CHECK constraints
// (every count must be zero first):
//
//   npx ts-node scripts/check-table-sync.ts
//
// It only reads. Safe against any database, local or remote.
import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "../generated/prisma/client";

const OPEN = ["AWAITING_RECEPTION", "PENDING", "CONFIRMED", "IN_KITCHEN", "READY"];

async function main() {
  const db = new PrismaClient();
  try {
    const activeDay = await db.businessDay.findFirst({ where: { isActive: true }, select: { id: true, label: true } });
    console.log(`Active business day: ${activeDay ? activeDay.label : "(none)"}`);

    // 1. Open dine-in orders with a table but no session — what the backfill attaches (active day) or leaves.
    const unattached = await db.order.findMany({
      where: { type: "DINE_IN", diningAreaId: { not: null }, tableSessionId: null, status: { in: OPEN as never[] } },
      select: { id: true, orderNumber: true, status: true, businessDayId: true, diningArea: { select: { id: true, name: true } } },
      orderBy: [{ diningAreaId: "asc" }, { createdAt: "asc" }],
    });
    const byTable = new Map<string, typeof unattached>();
    for (const order of unattached) {
      const key = order.diningArea?.name ?? "?";
      byTable.set(key, [...(byTable.get(key) ?? []), order]);
    }
    console.log(`\n1. Open dine-in orders on a table with no session: ${unattached.length}`);
    for (const [table, orders] of byTable) {
      const onActive = orders.filter((order) => order.businessDayId === activeDay?.id);
      const older = orders.length - onActive.length;
      const open = orders[0]?.diningArea
        ? await db.tableSession.findFirst({ where: { diningAreaId: orders[0].diningArea.id, status: "OPEN" }, select: { businessDayId: true } })
        : null;
      const plan =
        onActive.length === 0
          ? "left alone (earlier day: complete or cancel them)"
          : open && open.businessDayId === activeDay?.id
            ? "attached to the table's open session"
            : open
              ? "left alone (the table's open session is from another day)"
              : "a new MIGRATION session";
      console.log(`   ${table}: ${orders.map((order) => `#${order.orderNumber} ${order.status}`).join(", ")} -> ${plan}${older ? ` (${older} on an earlier day: left alone)` : ""}`);
    }

    // 2. Non-dine-in orders carrying a table or a session (the "Order_table_needs_dine_in" CHECK).
    const wrongType = await db.order.count({
      where: { type: { not: "DINE_IN" }, OR: [{ diningAreaId: { not: null } }, { tableSessionId: { not: null } }] },
    });
    console.log(`\n2. Takeaway/delivery orders with a table or session: ${wrongType}`);

    // 3. Accepted open dine-in orders without a session (the "Order_open_dine_in_has_session" CHECK).
    const acceptedUnattached = unattached.filter((order) => order.status !== "AWAITING_RECEPTION").length;
    console.log(`3. Accepted open dine-in orders without a session: ${acceptedUnattached}`);

    // 4. Orders whose table isn't their session's table (or one merged into it).
    const sessionOrders = await db.order.findMany({
      where: { tableSessionId: { not: null }, status: { in: OPEN as never[] } },
      select: {
        orderNumber: true,
        diningAreaId: true,
        tableSession: { select: { diningAreaId: true, mergedChildren: { select: { diningAreaId: true } } } },
      },
    });
    const mismatched = sessionOrders.filter(
      (order) =>
        order.tableSession &&
        order.diningAreaId !== order.tableSession.diningAreaId &&
        !order.tableSession.mergedChildren.some((child) => child.diningAreaId === order.diningAreaId),
    );
    console.log(`4. Open orders at a table other than their session's: ${mismatched.length}${mismatched.length ? ` (${mismatched.map((o) => `#${o.orderNumber}`).join(", ")})` : ""}`);

    // 5. Open sessions on switched-off or out-of-service tables, and from an earlier business day.
    const badTables = await db.tableSession.count({ where: { status: "OPEN", diningArea: { OR: [{ isActive: false }, { outOfService: true }] } } });
    const previousDay = await db.tableSession.count({ where: { status: "OPEN", businessDayId: activeDay ? { not: activeDay.id } : undefined } });
    console.log(`5. Open sessions on unavailable tables: ${badTables}; from an earlier business day: ${previousDay}`);

    const clean = wrongType === 0 && acceptedUnattached === 0 && mismatched.length === 0;
    console.log(`\n${clean ? "Ready for the §3.3 CHECK constraints." : "Not ready for the §3.3 CHECK constraints yet."}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
