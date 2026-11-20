import { readFileSync } from "fs";
import { join as joinPath } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderSource, OrderType, PaymentMethod, PaymentStatus, Prisma, StaffRole } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as businessDayService from "../businessDay/businessDay.service";
import * as diningAreaService from "../diningArea/diningArea.service";
import * as orderService from "../order/order.service";
import * as guestService from "../tableGuest/tableGuest.service";
import { parseTableOrderBody } from "../tableGuest/tableGuest.validators";
import { seedTableWorld } from "../tableGuest/tableQrTestSeed";
import * as billService from "./tableBill.service";
import * as moves from "./tableMoves.service";
import * as sessionService from "./tableSession.service";

// Table sync (docs/TABLE_SYNC_SPEC.md §5): every scenario of the matrix the backend can see, against the
// real services on the local database, each test rolled back. Concurrency (two requests at the same moment,
// on separate connections) is in tableSyncConcurrency.test.ts.

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

beforeEach(() => {
  sharedFakeIO.emits.length = 0;
});

type World = Awaited<ReturnType<typeof seedTableWorld>>;
type Tx = Prisma.TransactionClient;

let counter = 0;
const uuid = () => `00000000-0000-4000-9000-${String((counter += 1)).padStart(12, "0")}`;

const refusal = (error: unknown) => {
  const e = error as { status?: number; code?: string; extra?: Record<string, unknown> };
  return e && typeof e === "object" && "code" in e ? { status: e.status, code: e.code, ...(e.extra ?? {}) } : error;
};

const staff = (world: World, role: StaffRole = StaffRole.POS_ADMIN) => ({
  kind: "staff" as const,
  id: role === StaffRole.SUPER_ADMIN ? world.superAdmin.id : role === StaffRole.ORDER_TAKER ? world.waiter.id : world.posAdmin.id,
  role,
});

async function newTable(tx: Tx, name: string, extra: Prisma.DiningAreaUncheckedCreateInput | object = {}) {
  return tx.diningArea.create({ data: { name: `${name} ${(counter += 1)}`, type: "TABLE", area: "Family Hall", qrKey: `qr${String(counter).padStart(20, "0")}`, ...extra } });
}

/** A POS dine-in order of one tea (100), placed by the POS admin, with what the cashier saw at the table. */
function posOrder(world: World, diningAreaId: string, expectedTableSessionId: string | null | undefined, extra: Partial<orderService.CreateOrderInput> = {}) {
  return orderService.createOrder({
    source: OrderSource.POS,
    type: OrderType.DINE_IN,
    paymentMethod: PaymentMethod.CASH,
    placedByStaffId: world.posAdmin.id,
    placedByRole: StaffRole.POS_ADMIN,
    diningAreaId,
    ...(expectedTableSessionId !== undefined ? { expectedTableSessionId } : {}),
    items: [{ menuItemId: world.tea.id, quantity: 1 }],
    ...extra,
  });
}

async function join(world: World, qrKey: string, name: string) {
  const { result } = await guestService.joinTable(qrKey, { displayName: name, pin: undefined, joinRequestId: uuid() }, "10.0.0.9");
  return { token: result.token, guest: (await guestService.authenticateGuest(result.token))! };
}

const round = (items: unknown[]) => parseTableOrderBody({ clientRequestId: uuid(), items, deals: [] });

async function floorTable(id: string) {
  return (await sessionService.getFloor()).tables.find((table) => table.id === id);
}

const settleCash = (world: World, sessionId: string, extra: Partial<billService.SettleInput> = {}) =>
  billService.settleTable(sessionId, staff(world), {
    method: PaymentMethod.CASH,
    paidAmount: null,
    discount: undefined,
    discountReason: null,
    expectedBillVersion: undefined,
    ...extra,
  });

describe.skipIf(!isLocalDb)("table sync: one table system (local DB, rolled back)", () => {
  it("S1: a POS order on a free table opens the table's session (STAFF_ORDER), with a PIN when that's on, and the map shows it", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx, { requirePin: true });
      const order = await posOrder(world, world.table.id, null);
      const session = await tx.tableSession.findUniqueOrThrow({ where: { id: order.tableSessionId! }, include: { events: true } });
      return { order, session, tile: await floorTable(world.table.id), emits: [...sharedFakeIO.emits] };
    });
    expect(result.order.tableOpened).toEqual({ sessionId: result.session.id, pin: expect.stringMatching(/^\d{4}$/) });
    expect(result.session).toMatchObject({ status: "OPEN", openedVia: "STAFF_ORDER", openedByOrderId: result.order.id, joinPin: result.order.tableOpened!.pin });
    expect(result.session.events.map((event) => event.type)).toContain("OPENED_BY_ORDER");
    expect(result.tile).toMatchObject({ state: "IN_KITCHEN", session: { id: result.session.id, orderCount: 1, total: "100.00", openedVia: "STAFF_ORDER" } });
    // table:updated to the floor rooms with the new state, and the session announced as opened.
    const updated = result.emits.filter((emit) => emit.event === "table:updated");
    expect(updated.some((emit) => emit.rooms.includes("pos-admin") && (emit.payload as { state: string }).state === "IN_KITCHEN")).toBe(true);
    expect(result.emits.some((emit) => emit.event === "table-session:updated" && (emit.payload as { openedVia: string }).openedVia === "STAFF_ORDER")).toBe(true);
  });

  it("S2/S26: an open table needs the caller to say so — TABLE_OCCUPIED, TABLE_STATE_CHANGED, then the order joins the same bill", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const seated = await sessionService.seatTable(world.table.id, { id: world.waiter.id, role: StaffRole.ORDER_TAKER });
      const guest = await join(world, world.table.qrKey!, "Ali");
      const blind = await posOrder(world, world.table.id, null).catch(refusal);
      const stale = await posOrder(world, world.table.id, "some-old-session").catch(refusal);
      const joined = await posOrder(world, world.table.id, seated.session.id);
      const poll = await guestService.getSessionPoll(guest.guest);
      const orders = await tx.order.count({ where: { tableSessionId: seated.session.id } });
      return { seated, blind, stale, joined, poll, orders };
    });
    expect(result.blind).toMatchObject({ status: 409, code: "TABLE_OCCUPIED", sessionId: result.seated.session.id, session: { guestCount: 1 } });
    expect(result.stale).toMatchObject({ status: 409, code: "TABLE_STATE_CHANGED" });
    expect(result.joined.tableSessionId).toBe(result.seated.session.id);
    expect(result.joined.tableOpened).toBeNull();
    expect(result.orders).toBe(1);
    // The guest's phone sees the staff order as a round with no guest ("Added by staff").
    expect(result.poll.rounds).toEqual([expect.objectContaining({ orderId: result.joined.id, guestName: null, isMine: false })]);
  });

  // (That nothing is kept is checked on real connections in tableSyncConcurrency.test.ts: this harness runs every
  // service transaction inside one outer transaction with no savepoints, so a refused one isn't undone here.)
  it("S2 (D3): an order on a table whose bill already has a paid share is refused", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const first = await posOrder(world, world.table.id, null);
      const sessionId = first.tableSessionId!;
      const { bill: requested } = await billService.requestBill(sessionId, staff(world));
      const { bill: split } = await billService.setSplit(sessionId, staff(world), { mode: "EQUAL", parts: 2, expectedVersion: requested!.version });
      await billService.markSharePaid(sessionId, staff(world), split!.shares[0]!.id, null);
      return { refused: await posOrder(world, world.table.id, sessionId).catch(refusal) };
    });
    expect(result.refused).toMatchObject({ status: 409, code: "SPLIT_HAS_PAYMENTS" });
  });

  it("S3: guests join a table a POS order opened, and their QR round lands in the same session", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const first = await posOrder(world, world.table.id, null);
      const lookup = await guestService.getTableByQrKey(world.table.qrKey!);
      const guest = await join(world, world.table.qrKey!, "Sara");
      const placed = await guestService.createTableOrder(guest.guest, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      const qr = await tx.order.findUniqueOrThrow({ where: { id: placed.result.orderId } });
      return { first, lookup, guest, qr };
    });
    expect(result.lookup).toMatchObject({ state: "OPEN", orderingOpen: true });
    expect(result.guest.guest.sessionId).toBe(result.first.tableSessionId);
    expect(result.qr.tableSessionId).toBe(result.first.tableSessionId);
  });

  it("S5: an order taker's order opens the table; the cashier's blind order then gets TABLE_OCCUPIED and joins on resend", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { order: taker } = await orderService.submitOrderTakerOrder({
        placedByStaffId: world.waiter.id,
        diningAreaId: world.table.id,
        expectedTableSessionId: null,
        items: [{ menuItemId: world.tea.id, quantity: 1 }],
        clientRequestId: uuid(),
      });
      const blind = await posOrder(world, world.table.id, null).catch(refusal);
      const resent = await posOrder(world, world.table.id, taker.tableSessionId);
      const session = await tx.tableSession.findUniqueOrThrow({ where: { id: taker.tableSessionId! } });
      return { taker, blind, resent, session, tile: await floorTable(world.table.id) };
    });
    expect(result.taker.status).toBe("AWAITING_RECEPTION");
    expect(result.session).toMatchObject({ openedVia: "STAFF_ORDER", waiterStaffId: expect.any(String) });
    expect(result.blind).toMatchObject({ status: 409, code: "TABLE_OCCUPIED" });
    expect(result.resent.tableSessionId).toBe(result.taker.tableSessionId);
    expect(result.tile?.state).toBe("ORDER_AWAITING");
  });

  it("S7/S8: a rejected or cancelled last order frees a table an order opened; a seated table stays open", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const second = await newTable(tx, "Second");
      const { order: taker } = await orderService.submitOrderTakerOrder({
        placedByStaffId: world.waiter.id,
        diningAreaId: world.table.id,
        expectedTableSessionId: null,
        items: [{ menuItemId: world.tea.id, quantity: 1 }],
        clientRequestId: uuid(),
      });
      await orderService.rejectOrder(taker.id, { reason: "Wrong table" }, world.posAdmin.id);
      const afterReject = await tx.tableSession.findUniqueOrThrow({ where: { id: taker.tableSessionId! }, include: { events: true } });
      const pos = await posOrder(world, world.table.id, null);
      await orderService.cancelOrder(pos.id, { reason: "Changed their mind", actorId: world.posAdmin.id, actorRole: StaffRole.POS_ADMIN });
      const afterCancel = await tx.tableSession.findUniqueOrThrow({ where: { id: pos.tableSessionId! } });
      // Seated on purpose: the cancel of its only order leaves it open.
      const seated = await sessionService.seatTable(second.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const onSeated = await posOrder(world, second.id, seated.session.id);
      await orderService.cancelOrder(onSeated.id, { reason: "Mistake", actorId: world.posAdmin.id, actorRole: StaffRole.POS_ADMIN });
      const seatedAfter = await tx.tableSession.findUniqueOrThrow({ where: { id: seated.session.id } });
      return { afterReject, afterCancel, seatedAfter, tile: await floorTable(world.table.id), emits: [...sharedFakeIO.emits] };
    });
    expect(result.afterReject).toMatchObject({ status: "VOIDED", voidReason: "All orders cancelled" });
    expect(result.afterReject.events.map((event) => event.type)).toContain("AUTO_RELEASED");
    expect(result.afterCancel.status).toBe("VOIDED");
    expect(result.seatedAfter.status).toBe("OPEN");
    expect(result.tile?.state).toBe("EMPTY");
    expect(result.emits.some((emit) => emit.event === "table-session:updated" && (emit.payload as { status: string }).status === "VOIDED")).toBe(true);
  });

  it("R4: a table's order can't be paid, completed or delivered one by one (USE_TABLE_BILL); a takeaway still can", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const order = await posOrder(world, world.table.id, null);
      const options = { actorId: world.posAdmin.id, actorRole: StaffRole.POS_ADMIN };
      const pay = await orderService.updatePaymentStatus(order.id, PaymentStatus.VERIFIED, options).catch(refusal);
      const complete = await orderService.completeOrder(order.id, world.posAdmin.id).catch(refusal);
      const delivered = await orderService.markOrderDelivered(order.id, world.posAdmin.id).catch(refusal);
      const takeaway = await orderService.createOrder({
        source: OrderSource.POS,
        type: OrderType.TAKEAWAY,
        paymentMethod: PaymentMethod.CASH,
        placedByStaffId: world.posAdmin.id,
        items: [{ menuItemId: world.tea.id, quantity: 1 }],
      });
      const paidTakeaway = await orderService.updatePaymentStatus(takeaway.id, PaymentStatus.VERIFIED, options);
      const tableOnTakeaway = await orderService
        .createOrder({
          source: OrderSource.POS,
          type: OrderType.TAKEAWAY,
          paymentMethod: PaymentMethod.CASH,
          placedByStaffId: world.posAdmin.id,
          diningAreaId: world.table.id,
          items: [{ menuItemId: world.tea.id, quantity: 1 }],
        })
        .catch(refusal);
      return { pay, complete, delivered, paidTakeaway, tableOnTakeaway };
    });
    for (const attempt of [result.pay, result.complete, result.delivered]) {
      expect(attempt).toMatchObject({ status: 409, code: "USE_TABLE_BILL" });
    }
    expect(result.paidTakeaway.paymentStatus).toBe("VERIFIED");
    // S27 / R9: takeaway, delivery and online orders never touch tables.
    expect(result.tableOnTakeaway).toMatchObject({ status: 400, code: "TABLE_NOT_ALLOWED" });
  });

  it("R4: Settle & close pays the whole table at the counter (discount, change, receipt) and is idempotent", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const first = await posOrder(world, world.table.id, null);
      const second = await posOrder(world, world.table.id, first.tableSessionId, { items: [{ menuItemId: world.burger.id, quantity: 1 }] });
      const sessionId = first.tableSessionId!;
      const settled = await settleCash(world, sessionId, {
        paidAmount: new Prisma.Decimal(1000),
        discount: new Prisma.Decimal(60),
        discountReason: "Regular",
      });
      const again = await settleCash(world, sessionId);
      const orders = await tx.order.findMany({ where: { id: { in: [first.id, second.id] } }, orderBy: { orderNumber: "asc" } });
      const bill = await tx.tableBill.findUniqueOrThrow({ where: { sessionId }, include: { shares: true } });
      return { settled, again, orders, bill, tile: await floorTable(world.table.id) };
    });
    expect(result.settled.session.status).toBe("CLOSED");
    expect(result.settled.change).toBe("460.00"); // 600 − 60 = 540, 1000 handed over
    expect(result.settled.receiptKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.again).toMatchObject({ session: { status: "CLOSED" }, receiptKey: result.settled.receiptKey });
    expect(result.orders.map((order) => [order.status, order.paymentStatus])).toEqual([
      ["COMPLETED", "VERIFIED"],
      ["COMPLETED", "VERIFIED"],
    ]);
    expect(result.orders.reduce((sum, order) => sum.plus(order.totalAmount), new Prisma.Decimal(0)).toFixed(2)).toBe("540.00");
    expect(result.bill.status).toBe("PAID");
    expect(result.bill.shares.filter((share) => share.status === "VERIFIED")).toEqual([
      expect.objectContaining({ label: "Paid at the counter", amount: new Prisma.Decimal("540"), method: "CASH" }),
    ]);
    expect(result.tile?.state).toBe("EMPTY");
  });

  it("S11: Settle refuses while a guest's share has money; collect-cash waits for proofs, then collects the rest", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const order = await posOrder(world, world.table.id, null, { items: [{ menuItemId: world.burger.id, quantity: 1 }] });
      const sessionId = order.tableSessionId!;
      const { bill: requested } = await billService.requestBill(sessionId, staff(world));
      const { bill: split } = await billService.setSplit(sessionId, staff(world), { mode: "EQUAL", parts: 2, expectedVersion: requested!.version });
      // A guest uploaded a proof for share 1.
      await tx.tableBillShare.update({ where: { id: split!.shares[0]!.id }, data: { status: "PROOF_SUBMITTED", method: "ONLINE" } });
      const settle = await settleCash(world, sessionId).catch(refusal);
      const current = (await billService.staffBillView(tx, sessionId))!;
      const collectEarly = await billService.collectRemainingCash(sessionId, staff(world), current.version).catch(refusal);
      await billService.verifyShare(sessionId, staff(world), split!.shares[0]!.id);
      const afterVerify = (await billService.staffBillView(tx, sessionId))!;
      const collected = await billService.collectRemainingCash(sessionId, staff(world), afterVerify.version);
      const replay = await billService.collectRemainingCash(sessionId, staff(world), afterVerify.version);
      const closed = await sessionService.closeSession(sessionId, world.posAdmin.id);
      return { settle, collectEarly, collected, replay, closed };
    });
    expect(result.settle).toMatchObject({ status: 409, code: "SPLIT_HAS_PAYMENTS" });
    expect(result.collectEarly).toMatchObject({ status: 409, code: "PROOFS_TO_CHECK" });
    expect(result.collected.bill).toMatchObject({ status: "PAID" });
    expect(result.replay.bill).toMatchObject({ status: "PAID" });
    expect(result.closed.session.status).toBe("CLOSED");
  });

  it("R5/S30: a table with an unpaid (legacy delivered) order can't close without its bill", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const order = await posOrder(world, world.table.id, null);
      await tx.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
      const closing = await sessionService.closeSession(order.tableSessionId!, world.posAdmin.id).catch(refusal);
      const settled = await settleCash(world, order.tableSessionId!);
      return { closing, settled };
    });
    expect(result.closing).toMatchObject({ status: 409, code: "SESSION_HAS_UNPAID_ORDERS" });
    expect(result.settled.session.status).toBe("CLOSED");
  });

  it("S12: moving an order opens or joins the target, frees an emptied source, tells the kitchen, refuses a guest's round", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const target = await newTable(tx, "Target");
      const order = await posOrder(world, world.table.id, null);
      const source = order.tableSessionId!;
      const blind = await moves.moveOrderToTable(order.id, { diningAreaId: target.id, expectedTableSessionId: "nope" }, staff(world)).catch(refusal);
      const moved = await moves.moveOrderToTable(order.id, { diningAreaId: target.id, expectedTableSessionId: null }, staff(world));
      const sourceAfter = await tx.tableSession.findUniqueOrThrow({ where: { id: source } });
      const orderAfter = await tx.order.findUniqueOrThrow({ where: { id: order.id }, include: { events: true } });
      const same = await moves.moveOrderToTable(order.id, { diningAreaId: target.id, expectedTableSessionId: null }, staff(world)).catch(refusal);
      // A QR guest's own round moves only with its guest.
      const seated = await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const guest = await join(world, world.table.qrKey!, "Ali");
      const placed = await guestService.createTableOrder(guest.guest, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      const guestRound = await moves
        .moveOrderToTable(placed.result.orderId, { diningAreaId: target.id, expectedTableSessionId: moved.tableSessionId }, staff(world))
        .catch(refusal);
      return { blind, moved, sourceAfter, orderAfter, same, guestRound, seated, emits: [...sharedFakeIO.emits] };
    });
    expect(result.blind).toMatchObject({ status: 409, code: "TABLE_STATE_CHANGED" });
    expect(result.moved.tableOpened).not.toBeNull();
    expect(result.sourceAfter.status).toBe("VOIDED");
    expect(result.orderAfter.tableSessionId).toBe(result.moved.tableSessionId);
    expect(result.orderAfter.events.map((event) => event.type)).toContain("TABLE_CHANGED");
    expect(result.same).toMatchObject({ status: 400, code: "SAME_TABLE" });
    expect(result.guestRound).toMatchObject({ status: 409, code: "GUEST_ROUND_NOT_MOVABLE" });
    const changed = result.emits.filter((emit) => emit.event === "order:table-changed");
    expect(changed.some((emit) => emit.rooms.some((room) => room.startsWith("kitchen:")))).toBe(true);
  });

  it("S13: moving the party keeps the guests' tokens, tells their phones, and refuses a taken table", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const target = await newTable(tx, "Window");
      const taken = await newTable(tx, "Taken");
      const seated = await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const guest = await join(world, world.table.qrKey!, "Ali");
      const order = await posOrder(world, world.table.id, seated.session.id);
      await posOrder(world, taken.id, null);
      const refused = await moves.moveSession(seated.session.id, taken.id, staff(world)).catch(refusal);
      const moved = await moves.moveSession(seated.session.id, target.id, staff(world, StaffRole.ORDER_TAKER));
      const stillMe = await guestService.authenticateGuest(guest.token);
      const poll = await guestService.getSessionPoll(stillMe!);
      const orderAfter = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      return { target, refused, moved, stillMe, poll, orderAfter, oldTile: await floorTable(world.table.id), newTile: await floorTable(target.id) };
    });
    expect(result.refused).toMatchObject({ status: 409, code: "TARGET_OCCUPIED" });
    expect(result.moved.movedOrders).toBe(1);
    expect(result.stillMe).not.toBeNull();
    expect(result.poll.table).toMatchObject({ name: result.target.name, movedFrom: { name: expect.stringContaining("QR Table") } });
    expect(result.orderAfter.diningAreaId).toBe(result.target.id);
    expect(result.oldTile?.state).toBe("EMPTY");
    expect(result.newTile?.state).toBe("IN_KITCHEN");
  });

  it("S14: merging puts two parties on one bill; the joined table reads its parent, its QR joins the parent, and close gives it back", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const other = await newTable(tx, "Other");
      const a = await posOrder(world, world.table.id, null);
      const guest = await join(world, world.table.qrKey!, "Ali");
      const b = await posOrder(world, other.id, null);
      const merged = await moves.mergeSession(a.tableSessionId!, b.tableSessionId!, staff(world));
      const childTile = await floorTable(world.table.id);
      const parentTile = await floorTable(other.id);
      const movedGuest = await guestService.authenticateGuest(guest.token);
      const newcomer = await join(world, world.table.qrKey!, "Ali");
      const moreOnChild = await posOrder(world, world.table.id, b.tableSessionId);
      const poll = await guestService.getSessionPoll(movedGuest!);
      const settled = await settleCash(world, b.tableSessionId!);
      const child = await tx.tableSession.findUniqueOrThrow({ where: { id: a.tableSessionId! } });
      return { merged, childTile, parentTile, movedGuest, newcomer, moreOnChild, poll, settled, child, b, other, afterTile: await floorTable(world.table.id) };
    });
    expect(result.merged.sessionId).toBe(result.b.tableSessionId);
    expect(result.childTile).toMatchObject({ state: "IN_KITCHEN", session: { id: result.b.tableSessionId, joinedTo: { tableId: result.other.id }, orderCount: 2 } });
    expect(result.parentTile?.session?.joined).toHaveLength(1);
    expect(result.movedGuest?.sessionId).toBe(result.b.tableSessionId);
    expect(result.newcomer.guest.sessionId).toBe(result.b.tableSessionId);
    // The same name at the merged table gets a suffix.
    expect(result.newcomer.guest.displayName).toBe("Ali 2");
    expect(result.moreOnChild.tableSessionId).toBe(result.b.tableSessionId);
    expect(result.poll.joinedTables).toHaveLength(1);
    expect(result.poll.rounds).toHaveLength(3);
    expect(result.child.status).toBe("CLOSED");
    expect(result.afterTile?.state).toBe("EMPTY");
  });

  it("S14: merge refuses across business days and over payments; unmerge gives a table back without touching the bill", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const other = await newTable(tx, "Other");
      const a = await posOrder(world, world.table.id, null);
      const b = await posOrder(world, other.id, null);
      await tx.tableSession.update({ where: { id: a.tableSessionId! }, data: { businessDayId: world.day.id } });
      const differentDay = await moves.mergeSession(a.tableSessionId!, b.tableSessionId!, staff(world)).catch(refusal);
      await tx.tableSession.update({ where: { id: a.tableSessionId! }, data: { businessDayId: world.activeDay.id } });
      await moves.mergeSession(a.tableSessionId!, b.tableSessionId!, staff(world));
      const settleChild = await settleCash(world, a.tableSessionId!).catch(refusal);
      const unmerged = await moves.unmergeSession(a.tableSessionId!, staff(world));
      const orders = await tx.order.count({ where: { tableSessionId: b.tableSessionId! } });
      return { differentDay, settleChild, unmerged, orders, freed: await floorTable(world.table.id) };
    });
    expect(result.differentDay).toMatchObject({ status: 409, code: "MERGE_DIFFERENT_DAY" });
    expect(result.settleChild).toMatchObject({ status: 409, code: "SESSION_IS_MERGED" });
    expect(result.unmerged.status).toBe("VOIDED");
    expect(result.orders).toBe(2);
    expect(result.freed?.state).toBe("EMPTY");
  });

  it("S15: split off moves a guest with all their rounds to a free table and its own bill", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const target = await newTable(tx, "Corner");
      const seated = await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const ali = await join(world, world.table.qrKey!, "Ali");
      const sara = await join(world, world.table.qrKey!, "Sara");
      const aliRound = await guestService.createTableOrder(ali.guest, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      await guestService.createTableOrder(sara.guest, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      const missingRound = await moves
        .splitOffSession(seated.session.id, { diningAreaId: target.id, orderIds: [], guestIds: [ali.guest.id] }, staff(world))
        .catch(refusal);
      const split = await moves.splitOffSession(
        seated.session.id,
        { diningAreaId: target.id, orderIds: [aliRound.result.orderId], guestIds: [ali.guest.id] },
        staff(world),
      );
      const aliNow = await guestService.authenticateGuest(ali.token);
      const aliPoll = await guestService.getSessionPoll(aliNow!);
      const saraPoll = await guestService.getSessionPoll((await guestService.authenticateGuest(sara.token))!);
      const newSession = await tx.tableSession.findUniqueOrThrow({ where: { id: split.sessionId } });
      return { missingRound, split, aliNow, aliPoll, saraPoll, newSession, target };
    });
    expect(result.missingRound).toMatchObject({ status: 400, code: "GUEST_ROUNDS_MUST_MOVE_TOGETHER" });
    expect(result.newSession).toMatchObject({ openedVia: "SPLIT_OFF", diningAreaId: result.target.id, status: "OPEN" });
    expect(result.aliNow?.sessionId).toBe(result.split.sessionId);
    expect(result.aliPoll.table.name).toBe(result.target.name);
    expect(result.aliPoll.rounds).toHaveLength(1);
    expect(result.saraPoll.rounds).toHaveLength(1);
  });

  it("S16: a table in use can't be switched off, put out of service or deleted; its QR can be renewed", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      await posOrder(world, world.table.id, null);
      return {
        off: await diningAreaService.updateDiningArea(world.table.id, { isActive: false }).catch(refusal),
        outOfService: await diningAreaService.updateDiningArea(world.table.id, { outOfService: true }).catch(refusal),
        deleted: await diningAreaService.deleteDiningArea(world.table.id).catch(refusal),
        renamed: await diningAreaService.updateDiningArea(world.table.id, { name: "Renamed" }),
        regenerated: await sessionService.regenerateQrKey(world.table.id),
      };
    });
    for (const attempt of [result.off, result.outOfService, result.deleted]) {
      expect(attempt).toMatchObject({ status: 409, code: "TABLE_IN_USE" });
    }
    expect(result.renamed.name).toBe("Renamed");
    expect(result.regenerated.openSession).toBe(true);
  });

  it("S17: a released scheduled order takes a free table; on a busy one reception decides at accept", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const busy = await newTable(tx, "Busy");
      const later = new Date(Date.now() + 60 * 60 * 1000);
      const free = await posOrder(world, world.table.id, undefined, { scheduledFor: later });
      const onBusy = await posOrder(world, busy.id, undefined, { scheduledFor: later });
      const busySession = await sessionService.seatTable(busy.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const scheduledHasNoSession = free.tableSessionId;
      const releasedFree = await orderService.releaseScheduledOrderNow(free.id);
      const releasedBusy = await orderService.releaseScheduledOrderNow(onBusy.id);
      const blind = await orderService.acceptOrder(onBusy.id, world.posAdmin.id, {}).catch(refusal);
      const accepted = await orderService.acceptOrder(onBusy.id, world.posAdmin.id, { expectedTableSessionId: busySession.session.id });
      const opened = await tx.tableSession.findUniqueOrThrow({ where: { id: releasedFree.tableSessionId! } });
      return { scheduledHasNoSession, releasedFree, releasedBusy, blind, accepted, opened, busySession };
    });
    expect(result.scheduledHasNoSession).toBeNull();
    expect(result.opened).toMatchObject({ openedVia: "SCHEDULED_ORDER", status: "OPEN" });
    expect(result.releasedBusy.tableSessionId).toBeNull();
    expect(result.blind).toMatchObject({ status: 409, code: "TABLE_DECISION_NEEDED" });
    expect(result.accepted.tableSessionId).toBe(result.busySession.session.id);
  });

  it("S18: a forced day end closes the tables that owe nothing; the rest read PREVIOUS_DAY and take no new orders", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const idle = await newTable(tx, "Idle");
      const owing = await posOrder(world, world.table.id, null);
      const idleSeat = await sessionService.seatTable(idle.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const listed = await businessDayService.getOpenTableSessions(world.activeDay.id);
      const ended = await businessDayService.endBusinessDayForced(world.activeDay.id, world.posAdmin.id);
      const nextDay = await tx.businessDay.create({ data: { label: "next", startedAt: new Date(), isActive: true, openedById: world.posAdmin.id } });
      const tile = await floorTable(world.table.id);
      const blocked = await posOrder(world, world.table.id, owing.tableSessionId).catch(refusal);
      const idleAfter = await tx.tableSession.findUniqueOrThrow({ where: { id: idleSeat.session.id }, include: { events: true } });
      return { listed, ended, tile, blocked, idleAfter, nextDay };
    });
    expect(result.listed.map((entry) => entry.canClose).sort()).toEqual([false, true]);
    expect(result.listed.find((entry) => !entry.canClose)?.owed).toBe("100.00");
    expect(result.ended.closedTableSessions).toHaveLength(1);
    expect(result.ended.leftOpenTableSessions).toHaveLength(1);
    expect(result.idleAfter.status).toBe("CLOSED");
    expect(result.idleAfter.events.map((event) => event.type)).toContain("DAY_END_CLOSED");
    expect(result.tile?.state).toBe("PREVIOUS_DAY");
    expect(result.blocked).toMatchObject({ status: 409, code: "TABLE_FROM_PREVIOUS_DAY" });
  });

  it("S19: a waiter who is deactivated stops being the waiter of every open table", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { order } = await orderService.submitOrderTakerOrder({
        placedByStaffId: world.waiter.id,
        diningAreaId: world.table.id,
        expectedTableSessionId: null,
        items: [{ menuItemId: world.tea.id, quantity: 1 }],
        clientRequestId: uuid(),
      });
      const before = await tx.tableSession.findUniqueOrThrow({ where: { id: order.tableSessionId! } });
      const released = await sessionService.releaseWaiterFromOpenSessions(world.waiter.id, world.superAdmin.id);
      const after = await tx.tableSession.findUniqueOrThrow({ where: { id: order.tableSessionId! } });
      return { before, released, after, waiter: world.waiter.id };
    });
    expect(result.before.waiterStaffId).toBe(result.waiter);
    expect(result.released).toBe(1);
    expect(result.after.waiterStaffId).toBeNull();
  });

  it("the backfill attaches the active day's open dine-in orders, leaves earlier days alone, and changes nothing on a rerun", async () => {
    const sql = readFileSync(joinPath(__dirname, "../../../prisma/migrations/20261120120100_table_sync_backfill/migration.sql"), "utf8");
    const statements = sql
      .split(/;\s*\n/)
      .map((statement) => statement.replace(/--.*$/gm, "").trim())
      .filter((statement) => statement.length > 0);
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const seatedTable = await newTable(tx, "Seated");
      const freeTable = await newTable(tx, "Free");
      const oldTable = await newTable(tx, "Old");
      const seated = await sessionService.seatTable(seatedTable.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      // Orders from before table sync: a table and no session (written directly, as the old code did).
      const legacy = (diningAreaId: string, businessDayId: string, status: "PENDING" | "COMPLETED" | "AWAITING_RECEPTION" = "PENDING") =>
        world.order({ type: "DINE_IN", diningAreaId, businessDayId, status, orderNumber: 9000 + (counter += 1) });
      const onSeated = await legacy(seatedTable.id, world.activeDay.id);
      const onFree1 = await legacy(freeTable.id, world.activeDay.id);
      const onFree2 = await legacy(freeTable.id, world.activeDay.id, "AWAITING_RECEPTION");
      const done = await legacy(freeTable.id, world.activeDay.id, "COMPLETED");
      const older = await legacy(oldTable.id, world.day.id);
      const run = async () => {
        for (const statement of statements) {
          await tx.$executeRawUnsafe(statement);
        }
      };
      await run();
      const snapshot = async () => ({
        orders: await tx.order.findMany({
          where: { id: { in: [onSeated.id, onFree1.id, onFree2.id, done.id, older.id] } },
          select: { id: true, tableSessionId: true },
        }),
        sessions: await tx.tableSession.findMany({ where: { diningAreaId: { in: [freeTable.id, oldTable.id] } }, include: { events: true } }),
      });
      const first = await snapshot();
      await run();
      const second = await snapshot();
      return { seated, onSeated, onFree1, onFree2, done, older, first, second, freeTile: await floorTable(freeTable.id) };
    });
    const sessionOf = (id: string) => result.first.orders.find((order) => order.id === id)?.tableSessionId;
    expect(sessionOf(result.onSeated.id)).toBe(result.seated.session.id);
    expect(sessionOf(result.onFree1.id)).toBeTruthy();
    expect(sessionOf(result.onFree2.id)).toBe(sessionOf(result.onFree1.id));
    expect(sessionOf(result.done.id)).toBeNull();
    expect(sessionOf(result.older.id)).toBeNull();
    expect(result.first.sessions).toHaveLength(1);
    expect(result.first.sessions[0]).toMatchObject({ openedVia: "MIGRATION", status: "OPEN", joinPin: null });
    expect(result.first.sessions[0]!.events.map((event) => event.type)).toEqual(["MIGRATED"]);
    expect(result.second).toEqual(result.first);
    expect(result.freeTile?.state).toBe("ORDER_AWAITING");
  });
});

