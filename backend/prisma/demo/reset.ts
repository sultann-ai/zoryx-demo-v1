// npm run demo:reset -- --yes
//
// Wipes every app table (never _prisma_migrations) and loads the "Scoops & Slices Café" demo: the menu,
// people, stock, vendors and website content, 60 closed business days of history ending yesterday, and
// an open business day today with orders in every state. Same data on every run (seeded random), with
// dates relative to today.
//
// Refuses unless ALL of these hold:
//   - DEMO_RESET_ALLOWED=true in the environment,
//   - --yes on the command line,
//   - the database has no orders at all, or is already a demo (SiteSettings.isDemo).
// The database host is printed before anything else happens.
import "../../src/common/loadEnv";
import { Prisma } from "../../generated/prisma/client";
import { karachiDate } from "../../src/common/pkTime";
import { prisma } from "../../src/config/prisma";
import type { OrderPricingCatalog } from "../../src/modules/order/order.service";
import { seedCatalog } from "./catalog";
import { ITEMS } from "./data";
import { generateHistory, pkTime, type MenuEntry } from "./history";
import { SeededRandom } from "./random";
import { databaseRefusal, preflightRefusal } from "./safety";
import { seedToday } from "./today";

const SEED = 20261117;
const HISTORY_DAYS = 60;
const BATCH = 1000;

function describeDatabase(url: string): string {
  try {
    const parsed = new URL(url);
    const schema = parsed.searchParams.get("schema") ?? "public";
    return `${parsed.hostname}:${parsed.port || "5432"}${parsed.pathname} (schema ${schema})`;
  } catch {
    return "(DATABASE_URL could not be parsed)";
  }
}

function refuse(reason: string): never {
  console.error(`\nREFUSED: ${reason}\nNothing was changed.`);
  process.exit(1);
}

async function insertInBatches<T>(label: string, rows: T[], insert: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let start = 0; start < rows.length; start += BATCH) {
    await insert(rows.slice(start, start + BATCH));
  }
  console.log(`  ${label}: ${rows.length}`);
}

async function main(): Promise<void> {
  console.log(`Database: ${describeDatabase(process.env.DATABASE_URL ?? "")}`);

  const preflight = preflightRefusal({ allowedEnv: process.env.DEMO_RESET_ALLOWED, argv: process.argv });
  if (preflight) {
    refuse(preflight);
  }
  const [current] = await prisma.$queryRaw<{ schema: string }[]>`SELECT current_schema() AS schema`;
  console.log(`Schema in use: ${current?.schema ?? "(unknown)"}`);
  const orderCount = await prisma.order.count();
  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 }, select: { isDemo: true } });
  const refusal = databaseRefusal({ orderCount, isDemo: settings?.isDemo === true });
  if (refusal) {
    refuse(refusal);
  }

  const startedAt = Date.now();
  const now = new Date();
  const todayPk = karachiDate(now);
  // Today's business day opened at 11:45 (or half an hour ago, if the reset runs before opening).
  const todayStart = new Date(Math.min(pkTime(todayPk, 11, 45).getTime(), now.getTime() - 30 * 60 * 1000));

  // ---- wipe ----
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  const list = tables.map((table) => `"${table.tablename.replace(/"/g, '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  console.log(`Wiped ${tables.length} tables (kept _prisma_migrations).`);

  // ---- catalog ----
  const random = new SeededRandom(SEED);
  console.log("Seeding the menu, people, stock, vendors and website (with placeholder images)…");
  const ids = await seedCatalog(prisma, random, todayPk, HISTORY_DAYS);

  // ---- pricing catalog: the same shape order.service prices from ----
  const menuItems = await prisma.menuItem.findMany({ include: { variants: true } });
  const addOns = await prisma.addOn.findMany({ include: { prices: true } });
  const deals = await prisma.deal.findMany({ include: { items: { include: { menuItem: { select: { id: true, kitchenId: true } } } } } });
  const pricing: OrderPricingCatalog = {
    menuItemById: new Map(menuItems.map((item) => [item.id, item])),
    addOnById: new Map(addOns.map((addOn) => [addOn.id, addOn])),
    dealById: new Map(deals.map((deal) => [deal.id, deal])),
  };
  const menu: MenuEntry[] = ITEMS.filter((item) => !item.dealOnly).map((item) => {
    const row = menuItems.find((candidate) => candidate.slug === item.key)!;
    return {
      id: row.id,
      key: item.key,
      group: item.group,
      featured: item.featured ?? false,
      onlineOk: row.isAvailableOnline,
      isOpenPrice: row.isOpenPrice,
      variants: row.variants.map((variant) => ({ id: variant.id, label: variant.label })),
      categoryId: row.categoryId,
    };
  });
  const areas = await prisma.deliveryArea.findMany({ orderBy: { sortOrder: "asc" } });
  const capRow = await prisma.siteSettings.findUniqueOrThrow({ where: { id: 1 }, select: { maxDiscountPercentPosAdmin: true } });

  // ---- 60 days of history ----
  console.log(`Generating ${HISTORY_DAYS} days of history…`);
  const history = generateHistory(
    {
      random,
      pricing,
      menu,
      scoopAddOnIds: addOns.map((addOn) => addOn.id),
      dealIdByCode: ids.dealIdByCode,
      staff: {
        owner: ids.staffIdByKey.get("owner")!,
        manager: ids.staffIdByKey.get("manager")!,
        cashier: ids.staffIdByKey.get("cashier")!,
        online: ids.staffIdByKey.get("online")!,
        waiters: ["waiter1", "waiter2", "waiter3"].map((key) => ids.staffIdByKey.get(key)!),
      },
      employees: {
        waiters: ["waiter1", "waiter2", "waiter3"].map((key) => ids.employeeIdByKey.get(key)!),
        riders: ["rider1", "rider2"].map((key) => ids.employeeIdByKey.get(key)!),
      },
      tables: [...ids.tableIdByName.values()],
      areas: areas.map((area) => ({ id: area.id, nameEn: area.nameEn, fee: area.deliveryFee, min: area.minOrderAmount })),
      discountCapPercent: capRow.maxDiscountPercentPosAdmin,
    },
    todayPk,
    HISTORY_DAYS,
    todayStart,
  );
  await insertInBatches("business days", history.businessDays, (data) => prisma.businessDay.createMany({ data }));
  await insertInBatches("orders", history.orders, (data) => prisma.order.createMany({ data }));
  await insertInBatches("deal lines", history.dealLines, (data) => prisma.orderDealLine.createMany({ data }));
  await insertInBatches("order items", history.items, (data) => prisma.orderItem.createMany({ data }));
  await insertInBatches("order events", history.events, (data) => prisma.orderEvent.createMany({ data }));

  // ---- today ----
  console.log("Opening today's business day and placing today's orders…");
  const today = await seedToday(prisma, random, ids, todayStart, now);

  // ---- report ----
  const sales = await prisma.order.aggregate({
    where: { status: { notIn: ["CANCELLED", "AWAITING_RECEPTION", "SCHEDULED"] }, paymentStatus: "VERIFIED" },
    _sum: { totalAmount: true },
  });
  const counts = {
    orders: await prisma.order.count(),
    orderItems: await prisma.orderItem.count(),
    orderEvents: await prisma.orderEvent.count(),
    businessDays: await prisma.businessDay.count(),
    menuItems: await prisma.menuItem.count(),
    employees: await prisma.employee.count(),
    staffLogins: await prisma.staffUser.count(),
    attendance: await prisma.attendanceRecord.count(),
    inventoryItems: await prisma.inventoryItem.count(),
    vendors: await prisma.vendor.count(),
    vendorLedgerEntries: await prisma.vendorLedgerEntry.count(),
    images: await prisma.mediaAsset.count(),
  };
  console.log("\nDone.");
  console.table(counts);
  console.log(`Today: ${today.orders} orders. Paid sales across all days: Rs ${(sales._sum.totalAmount ?? new Prisma.Decimal(0)).toFixed(2)}`);
  console.log(`Runtime: ${((Date.now() - startedAt) / 1000).toFixed(1)} s`);
  console.log("All staff passwords: demo1234 (owner, manager, cashier, online, waiter1-3, scoop, bakery, chaibar).");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
