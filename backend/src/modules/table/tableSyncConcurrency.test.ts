import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { OrderSource, OrderType, PaymentMethod, Prisma, PrismaClient, StaffRole } from "../../../generated/prisma/client";
import { isLocalDb } from "../../common/testDb";
import * as orderService from "../order/order.service";
import * as billService from "./tableBill.service";
import * as sessionService from "./tableSession.service";

// Table sync R2/R10 under real concurrency: two requests at the same moment, each on its own database
// connection, committing for real (the rolled-back harness runs everything on one connection, so it can't show
// a race). Local database only. Every row is created here under a "SYNC-RACE" name and deleted in afterAll; the
// active business day is reused (or created and removed when there is none). Socket.io is faked.

vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

const db = new PrismaClient();
const tag = `SYNC-RACE-${Date.now()}`;
let seq = 0;
const unique = (prefix: string) => `${tag}-${prefix}-${(seq += 1)}`;

const ids = {
  createdDayId: null as string | null,
  dayId: "",
  posAdmin: "",
  superAdmin: "",
  taker: "",
  kitchen: "",
  item: "",
  tables: [] as string[],
};

const code = (result: PromiseSettledResult<unknown>) =>
  result.status === "rejected" ? ((result.reason as { code?: string }).code ?? String(result.reason)) : "OK";

async function table() {
  const created = await db.diningArea.create({ data: { name: unique("Table"), type: "TABLE" } });
  ids.tables.push(created.id);
  return created.id;
}

function posOrder(diningAreaId: string, expectedTableSessionId: string | null | undefined, role: StaffRole = StaffRole.POS_ADMIN) {
  return orderService.createOrder({
    source: OrderSource.POS,
    type: OrderType.DINE_IN,
    paymentMethod: PaymentMethod.CASH,
    placedByStaffId: role === StaffRole.SUPER_ADMIN ? ids.superAdmin : ids.posAdmin,
    placedByRole: role,
    diningAreaId,
    ...(expectedTableSessionId !== undefined ? { expectedTableSessionId } : {}),
    items: [{ menuItemId: ids.item, quantity: 1 }],
  });
}

const openSessions = (diningAreaId: string) => db.tableSession.count({ where: { diningAreaId, status: "OPEN" } });

describe.skipIf(!isLocalDb)("table sync under real concurrency (local DB, committed and cleaned up)", () => {
  beforeAll(async () => {
    const staff = (role: StaffRole) => db.staffUser.create({ data: { name: unique(role), username: unique("user"), passwordHash: "x", role } });
    ids.posAdmin = (await staff(StaffRole.POS_ADMIN)).id;
    ids.superAdmin = (await staff(StaffRole.SUPER_ADMIN)).id;
    ids.taker = (await staff(StaffRole.ORDER_TAKER)).id;
    const active = await db.businessDay.findFirst({ where: { isActive: true }, select: { id: true } });
    if (active) {
      ids.dayId = active.id;
    } else {
      const created = await db.businessDay.create({ data: { label: unique("day"), startedAt: new Date(), isActive: true, openedById: ids.posAdmin } });
      ids.dayId = created.id;
      ids.createdDayId = created.id;
    }
    ids.kitchen = (await db.kitchen.create({ data: { name: unique("Kitchen") } })).id;
    // No inventory link: these orders move no stock.
    ids.item = (await db.menuItem.create({ data: { name: unique("Tea"), slug: unique("tea").toLowerCase(), price: 100, kitchenId: ids.kitchen } })).id;
  });

  afterAll(async () => {
    const sessions = (await db.tableSession.findMany({ where: { diningAreaId: { in: ids.tables } }, select: { id: true } })).map((s) => s.id);
    const orders = (await db.order.findMany({ where: { OR: [{ diningAreaId: { in: ids.tables } }, { tableSessionId: { in: sessions } }] }, select: { id: true } })).map((o) => o.id);
    await db.tableReceipt.deleteMany({ where: { sessionId: { in: sessions } } });
    await db.orderItem.deleteMany({ where: { orderId: { in: orders } } });
    await db.orderDealLine.deleteMany({ where: { orderId: { in: orders } } });
    await db.inventoryTransaction.deleteMany({ where: { relatedOrderId: { in: orders } } });
    await db.order.deleteMany({ where: { id: { in: orders } } });
    await db.tableSession.updateMany({ where: { id: { in: sessions } }, data: { mergedIntoSessionId: null } });
    await db.tableSession.deleteMany({ where: { id: { in: sessions } } });
    await db.diningArea.deleteMany({ where: { id: { in: ids.tables } } });
    await db.menuItem.deleteMany({ where: { id: ids.item } });
    await db.kitchen.deleteMany({ where: { id: ids.kitchen } });
    if (ids.createdDayId) {
      await db.businessDay.delete({ where: { id: ids.createdDayId } });
    }
    await db.staffUser.deleteMany({ where: { id: { in: [ids.posAdmin, ids.superAdmin, ids.taker] } } });
    await db.$disconnect();
  });

  it("two seats of the same table at once: one seats it, the other gets TABLE_OCCUPIED, one session exists", async () => {
    const id = await table();
    const actor = { id: ids.posAdmin, role: StaffRole.POS_ADMIN };
    const results = await Promise.allSettled([sessionService.seatTable(id, actor), sessionService.seatTable(id, actor)]);
    expect(results.map(code).sort()).toEqual(["OK", "TABLE_OCCUPIED"]);
    expect(await openSessions(id)).toBe(1);
  });

  it("two orders that both believe the table is free: one opens it, the other gets TABLE_OCCUPIED", async () => {
    const id = await table();
    const results = await Promise.allSettled([posOrder(id, null), posOrder(id, null)]);
    expect(results.map(code).sort()).toEqual(["OK", "TABLE_OCCUPIED"]);
    expect(await openSessions(id)).toBe(1);
    expect(await db.order.count({ where: { diningAreaId: id } })).toBe(1);
  });

  it("two orders that join whatever is open, at once: both land in one session", async () => {
    const id = await table();
    const [a, b] = await Promise.all([posOrder(id, undefined), posOrder(id, undefined)]);
    expect(a.tableSessionId).toBe(b.tableSessionId);
    expect([a.tableOpened, b.tableOpened].filter(Boolean)).toHaveLength(1);
    expect(await openSessions(id)).toBe(1);
  });

  it("a Seat and an order at the same moment: one session, and the order is in it", async () => {
    const id = await table();
    const results = await Promise.allSettled([sessionService.seatTable(id, { id: ids.posAdmin, role: StaffRole.POS_ADMIN }), posOrder(id, undefined)]);
    expect(await openSessions(id)).toBe(1);
    const session = await db.tableSession.findFirstOrThrow({ where: { diningAreaId: id, status: "OPEN" } });
    expect(await db.order.findFirst({ where: { diningAreaId: id }, select: { tableSessionId: true } })).toEqual({ tableSessionId: session.id });
    // The seat either won (the order joined it) or lost to the order's session (TABLE_OCCUPIED).
    expect(["OK", "TABLE_OCCUPIED"]).toContain(code(results[0]));
    expect(code(results[1])).toBe("OK");
  });

  it("D7: two accepts of the same order at once — one wins, one is told it was already reviewed, one ACCEPTED event", async () => {
    const id = await table();
    const { order } = await orderService.submitOrderTakerOrder({
      placedByStaffId: ids.taker,
      diningAreaId: id,
      expectedTableSessionId: null,
      items: [{ menuItemId: ids.item, quantity: 1 }],
      clientRequestId: crypto.randomUUID(),
    });
    const results = await Promise.allSettled([
      orderService.acceptOrder(order.id, ids.posAdmin, {}),
      orderService.acceptOrder(order.id, ids.posAdmin, {}),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(orderService.OrderNotAwaitingReceptionError);
    expect(await db.orderEvent.count({ where: { orderId: order.id, type: "ACCEPTED" } })).toBe(1);
  });

  it("D3: an order refused because the table's bill has a paid share leaves nothing behind", async () => {
    const id = await table();
    const first = await posOrder(id, null);
    const sessionId = first.tableSessionId!;
    const actor = { kind: "staff" as const, id: ids.posAdmin, role: StaffRole.POS_ADMIN };
    const { bill: requested } = await billService.requestBill(sessionId, actor);
    const { bill: split } = await billService.setSplit(sessionId, actor, { mode: "EQUAL", parts: 2, expectedVersion: requested!.version });
    await billService.markSharePaid(sessionId, actor, split!.shares[0]!.id, null);
    const refused = await posOrder(id, sessionId).catch((error) => error);
    expect(refused).toMatchObject({ code: "SPLIT_HAS_PAYMENTS" });
    expect(await db.order.count({ where: { diningAreaId: id } })).toBe(1);
  });

  it("D5: a cancel and a bill discount on the same table at once never deadlock", async () => {
    const id = await table();
    const first = await posOrder(id, null);
    const second = await posOrder(id, first.tableSessionId);
    const sessionId = first.tableSessionId!;
    const admin = { kind: "staff" as const, id: ids.superAdmin, role: StaffRole.SUPER_ADMIN };
    const { bill } = await billService.requestBill(sessionId, admin);
    const results = await Promise.allSettled([
      orderService.cancelOrder(second.id, { reason: "Race", actorId: ids.superAdmin, actorRole: StaffRole.SUPER_ADMIN }),
      billService.setBillDiscount(sessionId, admin, { discount: new Prisma.Decimal(20), discountReason: "Race", expectedVersion: bill!.version }),
    ]);
    const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected").map((result) => result.reason as { code?: string; message?: string });
    // A lost race is a clean 409 (the bill changed), never a deadlock or a 500.
    for (const failure of failures) {
      expect(failure.message ?? "").not.toMatch(/deadlock/i);
      expect(failure.code).toBe("BILL_CHANGED");
    }
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  });

  it("two Settles of the same table at once: the money is taken once and both answer the closed table", async () => {
    const id = await table();
    const first = await posOrder(id, null);
    await posOrder(id, first.tableSessionId);
    const sessionId = first.tableSessionId!;
    const actor = { kind: "staff" as const, id: ids.posAdmin, role: StaffRole.POS_ADMIN };
    const input = { method: PaymentMethod.CASH, paidAmount: null, discount: undefined, discountReason: null, expectedBillVersion: undefined };
    const results = await Promise.allSettled([billService.settleTable(sessionId, actor, input), billService.settleTable(sessionId, actor, input)]);
    expect(results.map(code)).toEqual(["OK", "OK"]);
    const orders = await db.order.findMany({ where: { tableSessionId: sessionId }, select: { id: true, paymentStatus: true, status: true } });
    expect(orders.every((order) => order.paymentStatus === "VERIFIED" && order.status === "COMPLETED")).toBe(true);
    expect(await db.orderEvent.count({ where: { orderId: { in: orders.map((order) => order.id) }, type: "PAYMENT_MARKED" } })).toBe(orders.length);
    expect(await db.tableSession.count({ where: { id: sessionId, status: "CLOSED" } })).toBe(1);
  });
});
