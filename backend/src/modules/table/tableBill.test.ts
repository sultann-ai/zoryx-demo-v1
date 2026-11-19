import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderStatus, PaymentMethod, PaymentStatus, Prisma, SplitMode, StaffRole, TableBillLineKind } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as orderService from "../order/order.service";
import { parseTableOrderBody } from "../tableGuest/tableGuest.validators";
import * as guestService from "../tableGuest/tableGuest.service";
import { seedTableWorld } from "../tableGuest/tableQrTestSeed";
import * as billService from "./tableBill.service";
import { BillValidationError, parseGuestSplit } from "./tableBill.validators";
import { TableStaffError } from "./tableErrors";
import * as sessionService from "./tableSession.service";

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
const D = (value: string | number) => new Prisma.Decimal(value);

const refusal = (error: unknown) =>
  error instanceof TableStaffError || error instanceof guestService.TableGuestError
    ? { status: error.status, code: error.code, ...error.extra }
    : error instanceof Error
      ? { message: error.message, name: error.constructor.name }
      : error;
const caught = (promise: Promise<unknown>) => promise.then(() => "no error", refusal);

// A fake, already-processed proof image (the real upload path runs processProof first).
const proofImage = { data: Buffer.from([1, 2, 3]), thumb: null, mimeType: "image/webp" as const, width: 1, height: 1, hasTransparency: false };

/** Seats the table, joins `names`, and gives back each guest (as the token middleware resolves it) with its token. */
async function seat(world: World, names: string[]) {
  const seated = await sessionService.seatTable(world.table.id, { id: world.waiter.id, role: StaffRole.ORDER_TAKER });
  const guests = [];
  for (const name of names) {
    const { result } = await guestService.joinTable(world.table.qrKey as string, { displayName: name, pin: undefined, joinRequestId: uuid() }, "10.0.0.9");
    const guest = (await guestService.authenticateGuest(result.token))!;
    guests.push({ ...guest, token: result.token, actor: { kind: "guest" as const, guestId: guest.id, sessionId: guest.sessionId } });
  }
  return { sessionId: seated.session.id, guests };
}

/** A guest's round, accepted by reception (so it's billable and not awaiting). */
async function orderAndAccept(world: World, guest: { id: string; sessionId: string; displayName: string; joinOrder: number; diningAreaId: string }, items: { menuItemId: string; quantity: number }[]) {
  const { result } = await guestService.createTableOrder(guest, parseTableOrderBody({ clientRequestId: uuid(), items, deals: [] }));
  await orderService.acceptOrder(result.orderId, world.posAdmin.id, {});
  return result.orderId;
}

async function qrItem(tx: Tx, world: World, name: string, price: number) {
  return tx.menuItem.create({ data: { name, slug: `${name}-${uuid()}`, price, kitchenId: world.kitchenA.id, isAvailableOnQr: true } });
}

const staff = (world: World, role: StaffRole = StaffRole.POS_ADMIN) => ({
  kind: "staff" as const,
  id: role === StaffRole.SUPER_ADMIN ? world.superAdmin.id : world.posAdmin.id,
  role,
});

const amounts = (bill: { shares: { amount: string }[] } | null) => bill?.shares.map((share) => share.amount);
const sumOf = (bill: { shares: { amount: string }[] } | null) =>
  (bill?.shares ?? []).reduce((acc, share) => acc.plus(share.amount), D(0)).toFixed(2);

async function staffBill(sessionId: string) {
  return (await billService.staffBillView((await import("../../common/testDb")).prismaProxy as unknown as Tx, sessionId))!;
}

describe.skipIf(!isLocalDb)("table bill (local DB, rolled back)", () => {
  it("EQUAL: 1001 three ways, then staff discounts (allocated onto the orders) and every split still sums to the total", async () => {
    const r = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const platter = await qrItem(tx, world, "Platter", 1001);
      const { sessionId, guests } = await seat(world, ["Ali", "Sara", "Omar"]);
      const [ali] = guests;
      const orderId = await orderAndAccept(world, ali!, [{ menuItemId: platter.id, quantity: 1 }]);

      const requested = await billService.requestBill(sessionId, ali!.actor);
      const split = await billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.EQUAL, parts: 3, expectedVersion: requested.bill!.version });

      const afterDiscount = await billService.setBillDiscount(sessionId, staff(world, StaffRole.SUPER_ADMIN), {
        discount: D(101),
        discountReason: "Regulars",
        expectedVersion: (await staffBill(sessionId)).version,
      });
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { discount: true, totalAmount: true } });
      const resplit = await billService.setSplit(sessionId, staff(world), { mode: SplitMode.EQUAL, parts: 3, expectedVersion: afterDiscount.bill!.version });

      const awkward = await billService.setBillDiscount(sessionId, staff(world, StaffRole.SUPER_ADMIN), {
        discount: D("101.25"),
        discountReason: "Regulars",
        expectedVersion: resplit.bill!.version,
      });
      const four = await billService.setSplit(sessionId, staff(world), { mode: SplitMode.EQUAL, parts: 4, expectedVersion: awkward.bill!.version });
      const events = await tx.orderEvent.findMany({ where: { orderId, type: "DISCOUNT_SET" } });
      return { split, afterDiscount, order, resplit, four, events };
    });
    expect(amounts(r.split.bill)).toEqual(["335.00", "333.00", "333.00"]);
    expect(sumOf(r.split.bill)).toBe("1001.00");
    // The discount lands on the order itself (reports read Order), and cancels the split.
    expect(r.order).toMatchObject({ discount: D(101), totalAmount: D(900) });
    expect(r.afterDiscount.bill).toMatchObject({ total: "900.00", discount: "101.00", shares: [], needsSplit: true });
    expect(amounts(r.resplit.bill)).toEqual(["300.00", "300.00", "300.00"]);
    expect(amounts(r.four.bill)).toEqual(["227.75", "224.00", "224.00", "224.00"]);
    expect(sumOf(r.four.bill)).toBe("899.75");
    expect(r.events.map((event) => (event.after as { via?: string }).via)).toEqual(["table_bill", "table_bill"]);
  });

  it("BY_ITEMS with a shared item: unclaimed it's split by everyone, claimed it moves to the claimer", async () => {
    const r = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const fries = await qrItem(tx, world, "Fries", 150);
      const { sessionId, guests } = await seat(world, ["Ali", "Sara"]);
      const [ali, sara] = guests;
      const aliOrder = await orderAndAccept(world, ali!, [{ menuItemId: world.burger.id, quantity: 1 }]);
      await orderAndAccept(world, sara!, [{ menuItemId: fries.id, quantity: 2 }]);
      // Staff bring a plate of fries for the table: a line nobody owns.
      await orderService.addOrderItems(aliOrder, { items: [{ menuItemId: fries.id, quantity: 1 }], performedById: world.posAdmin.id });
      const sharedLine = await tx.orderItem.findFirstOrThrow({ where: { orderId: aliOrder, tableGuestId: null } });

      const requested = await billService.requestBill(sessionId, staff(world));
      const unclaimed = await billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.BY_ITEMS, expectedVersion: requested.bill!.version });
      const claimed = await billService.setClaim(sessionId, sara!.actor, {
        lineKind: TableBillLineKind.ITEM,
        lineId: sharedLine.id,
        claimed: true,
        expectedVersion: unclaimed.bill!.version,
      });
      const aliView = await billService.guestBillView(tx, sessionId, ali!.id);
      const ownLine = await tx.orderItem.findFirstOrThrow({ where: { orderId: aliOrder, tableGuestId: ali!.id } });
      const claimOwn = await caught(
        billService.setClaim(sessionId, ali!.actor, { lineKind: TableBillLineKind.ITEM, lineId: ownLine.id, claimed: true, expectedVersion: claimed.bill!.version }),
      );
      return { unclaimed, claimed, aliView, claimOwn, sharedLineId: sharedLine.id };
    });
    expect(r.unclaimed.bill!.shares.map((s) => [s.label, s.amount])).toEqual([
      ["Ali", "575.00"],
      ["Sara", "375.00"],
    ]);
    expect(r.claimed.bill!.shares.map((s) => [s.label, s.amount, s.isMine])).toEqual([
      ["Ali", "500.00", false],
      ["Sara", "450.00", true],
    ]);
    expect(sumOf(r.claimed.bill)).toBe("950.00");
    expect(r.aliView!.sharedLines.find((line) => line.lineId === r.sharedLineId)).toMatchObject({ claimedBy: ["Sara"], ownerName: null });
    expect(r.claimOwn).toMatchObject({ status: 400, code: "BAD_REQUEST" });
  });

  it("refuses tampering: amounts from a guest, custom splits by guests, someone else's share, another table's share", async () => {
    const r = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seat(world, ["Ali", "Sara"]);
      const [ali, sara] = guests;
      await orderAndAccept(world, ali!, [{ menuItemId: world.burger.id, quantity: 1 }]);
      await orderAndAccept(world, sara!, [{ menuItemId: world.burger.id, quantity: 1 }]);
      const requested = await billService.requestBill(sessionId, ali!.actor);
      const version = requested.bill!.version;

      // A guest may propose custom amounts, but the server still holds them to the bill exactly.
      const guestCustom = await caught(billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.CUSTOM, shares: [{ amount: D(1), guestId: null }], expectedVersion: version }));
      const guestGivesAway = await caught(
        billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.CUSTOM, shares: [{ amount: D(1000), guestId: sara!.id }], expectedVersion: version }),
      );
      const badSum = await caught(
        billService.setSplit(sessionId, staff(world), { mode: SplitMode.CUSTOM, shares: [{ amount: D(600), guestId: null }, { amount: D(300), guestId: null }], expectedVersion: version }),
      );
      const split = await billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.BY_ITEMS, expectedVersion: version });
      const aliShare = split.bill!.shares.find((share) => share.guestId === ali!.id)!;
      const payOthers = await caught(billService.payShare(sessionId, sara!.actor, aliShare.id, PaymentMethod.ONLINE));
      const proofOthers = await caught(billService.attachShareProof(sessionId, sara!.actor, aliShare.id, proofImage));
      const stale = await caught(billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.EQUAL, parts: 2, expectedVersion: version }));
      const lowCash = await caught(billService.markSharePaid(sessionId, staff(world), aliShare.id, D(499)));

      // A guest of a different table can't reach this table's shares: not even "not yours", just not found.
      const otherTable = await tx.diningArea.create({ data: { name: "Other table", type: "TABLE", qrKey: "OtherTableQrKey0000000A" } });
      await sessionService.seatTable(otherTable.id, { id: world.waiter.id, role: StaffRole.ORDER_TAKER });
      const { result } = await guestService.joinTable("OtherTableQrKey0000000A", { displayName: "Stranger", pin: undefined, joinRequestId: uuid() }, "10.0.0.8");
      const stranger = (await guestService.authenticateGuest(result.token))!;
      const strangerActor = { kind: "guest" as const, guestId: stranger.id, sessionId: stranger.sessionId };
      const crossPay = await caught(billService.payShare(stranger.sessionId, strangerActor, aliShare.id, PaymentMethod.CASH));
      // ...and can't use its own token against this session either.
      const crossSession = await caught(billService.payShare(sessionId, strangerActor, aliShare.id, PaymentMethod.CASH));
      const after = await staffBill(sessionId);
      return { guestCustom, guestGivesAway, badSum, payOthers, proofOthers, stale, lowCash, crossPay, crossSession, after };
    });
    expect(() => parseGuestSplit({ mode: "EQUAL", parts: 2, shares: [{ amount: 1 }], expectedVersion: 0 })).toThrow(BillValidationError);
    expect(r.guestCustom).toMatchObject({ status: 400, code: "SPLIT_SUM_MISMATCH", total: "1000.00", sum: "1.00" });
    expect(r.guestGivesAway).toMatchObject({ status: 400, code: "BAD_REQUEST" });
    // Over HTTP a guest's custom share can't even name a guest.
    expect(() => parseGuestSplit({ mode: "CUSTOM", shares: [{ amount: 1000, guestId: "x" }], expectedVersion: 0 })).toThrow(BillValidationError);
    expect(r.badSum).toMatchObject({ status: 400, code: "SPLIT_SUM_MISMATCH", total: "1000.00", sum: "900.00" });
    expect(r.payOthers).toMatchObject({ status: 403, code: "NOT_YOUR_SHARE" });
    expect(r.proofOthers).toMatchObject({ status: 403, code: "NOT_YOUR_SHARE" });
    expect(r.stale).toMatchObject({ status: 409, code: "BILL_CHANGED" });
    expect((r.stale as { bill?: { shares: unknown[] } }).bill?.shares).toHaveLength(2);
    expect(r.lowCash).toMatchObject({ status: 400, code: "BAD_REQUEST" });
    expect(r.crossPay).toMatchObject({ status: 409, code: "BILL_NOT_REQUESTED" });
    expect(r.crossSession).toMatchObject({ status: 401, code: "SESSION_ENDED" });
    // Nothing above changed a share.
    expect(r.after.shares.map((share) => share.status)).toEqual(["UNPAID", "UNPAID"]);
    expect(sumOf(r.after)).toBe("1000.00");
  });

  it("adding items after a split cancels it; once a share is paid, the change is refused", async () => {
    const r = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seat(world, ["Ali", "Sara"]);
      const [ali, sara] = guests;
      const aliOrder = await orderAndAccept(world, ali!, [{ menuItemId: world.burger.id, quantity: 1 }]);
      await orderAndAccept(world, sara!, [{ menuItemId: world.burger.id, quantity: 1 }]);
      const requested = await billService.requestBill(sessionId, ali!.actor);
      const first = await billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.EQUAL, parts: 2, expectedVersion: requested.bill!.version });

      await orderService.addOrderItems(aliOrder, { items: [{ menuItemId: world.tea.id, quantity: 1 }], performedById: world.posAdmin.id });
      const cancelled = await billService.guestBillView(tx, sessionId, ali!.id);
      const voided = await tx.tableBillShare.findMany({ where: { id: { in: first.bill!.shares.map((s) => s.id) } }, select: { status: true } });
      const event = await tx.tableSessionEvent.findFirst({ where: { sessionId, type: "SPLIT_CANCELLED" } });

      const again = await billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.EQUAL, parts: 2, expectedVersion: cancelled!.version });
      await billService.markSharePaid(sessionId, staff(world), again.bill!.shares[0]!.id, null);
      const refused = await caught(
        orderService.addOrderItems(aliOrder, { items: [{ menuItemId: world.tea.id, quantity: 1 }], performedById: world.posAdmin.id }),
      );
      const billAfter = await staffBill(sessionId);
      return { first, cancelled, voided, event, again, refused, billAfter };
    });
    expect(sumOf(r.first.bill)).toBe("1000.00");
    expect(r.voided.map((share) => share.status)).toEqual(["VOID", "VOID"]);
    expect(r.cancelled).toMatchObject({ total: "1100.00", shares: [], needsSplit: true, splitMode: "EQUAL" });
    expect(r.event).not.toBeNull();
    expect(amounts(r.again.bill)).toEqual(["550.00", "550.00"]);
    expect(r.refused).toMatchObject({ status: 409, code: "SPLIT_HAS_PAYMENTS" });
    // The refusal is thrown before the bill is touched: same total, same split, the paid share still paid.
    // (The order's own writes roll back with prisma.$transaction in production; withRollback's shared
    // test transaction has no savepoints, so they can't be observed rolling back here.)
    expect(r.billAfter).toMatchObject({ total: "1100.00", splitVersion: r.again.bill!.splitVersion });
    expect(r.billAfter.shares.map((share) => share.status)).toEqual(["VERIFIED", "UNPAID"]);
    expect(sharedFakeIO.emits.some((emit) => emit.event === "table-bill:updated")).toBe(true);
  });

  it("PAID only once every share is verified; close settles the orders, kills the tokens and makes the receipt link", async () => {
    const r = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seat(world, ["Ali", "Sara", "Omar"]);
      const [ali, sara, omar] = guests;
      const orderIds = [
        await orderAndAccept(world, ali!, [{ menuItemId: world.burger.id, quantity: 1 }]),
        await orderAndAccept(world, sara!, [{ menuItemId: world.burger.id, quantity: 1 }]),
        await orderAndAccept(world, omar!, [{ menuItemId: world.burger.id, quantity: 1 }]),
      ];
      const requested = await billService.requestBill(sessionId, sara!.actor);
      const split = await billService.setSplit(sessionId, sara!.actor, { mode: SplitMode.BY_ITEMS, expectedVersion: requested.bill!.version });
      const shareOf = (guestId: string) => split.bill!.shares.find((share) => share.guestId === guestId)!.id;

      const online = await billService.payShare(sessionId, ali!.actor, shareOf(ali!.id), PaymentMethod.ONLINE);
      await billService.attachShareProof(sessionId, ali!.actor, shareOf(ali!.id), proofImage);
      await billService.payShare(sessionId, sara!.actor, shareOf(sara!.id), PaymentMethod.CASH);
      await billService.payShare(sessionId, sara!.actor, shareOf(sara!.id), PaymentMethod.CASH); // a double tap
      const cashCalls = await tx.tableCall.count({ where: { sessionId, type: "BILL_CASH" } });

      await billService.verifyShare(sessionId, staff(world), shareOf(ali!.id));
      const afterOne = await staffBill(sessionId);
      await billService.markSharePaid(sessionId, staff(world), shareOf(sara!.id), D(1000));
      const afterTwo = await staffBill(sessionId);
      const earlyClose = await caught(sessionService.closeSession(sessionId, world.posAdmin.id));
      await billService.markSharePaid(sessionId, staff(world), shareOf(omar!.id), null);
      const afterThree = await staffBill(sessionId);
      const paidEvents = await tx.tableSessionEvent.count({ where: { sessionId, type: "BILL_PAID" } });
      // The receipt exists from the moment the bill is paid, and every guest's poll carries its link.
      const pollAtPaid = await guestService.getSessionPoll(omar!);
      const receiptAtPaid = await billService.getPublicReceipt(pollAtPaid.receiptKey!);

      const closed = await sessionService.closeSession(sessionId, world.posAdmin.id);
      const closedAgain = await sessionService.closeSession(sessionId, world.posAdmin.id);
      const orders = await tx.order.findMany({ where: { id: { in: orderIds } }, select: { status: true, paymentStatus: true, paymentMethod: true, paidAmount: true } });
      const tokenAfter = await guestService.authenticateGuest(ali!.token);
      const keyForPhone = await billService.receiptKeyForToken(ali!.token);
      const receipt = await billService.getPublicReceipt(closed.receiptKey!);
      const lateProof = await caught(billService.attachShareProof(sessionId, omar!.actor, shareOf(omar!.id), proofImage));
      return { online, cashCalls, afterOne, afterTwo, earlyClose, afterThree, paidEvents, pollAtPaid, receiptAtPaid, closed, closedAgain, orders, tokenAfter, keyForPhone, receipt, lateProof };
    });
    expect(r.online.paymentAccounts).toBeDefined();
    expect(r.cashCalls).toBe(1);
    expect(r.afterOne.status).toBe("REQUESTED");
    expect(r.afterTwo).toMatchObject({ status: "REQUESTED" });
    expect(r.afterTwo.shares.find((share) => share.paidAmount === "1000.00")).toMatchObject({ change: "500.00", method: "CASH" });
    expect(r.earlyClose).toMatchObject({ status: 409, code: "BILL_NOT_PAID" });
    expect(r.afterThree.status).toBe("PAID");
    expect(r.afterThree.shares.every((share) => share.status === "VERIFIED")).toBe(true);
    expect(r.paidEvents).toBe(1);
    // Mixed cash/online: the orders are recorded as CASH (Conflict C3), paid in full, and completed.
    expect(r.orders.every((order) => order.status === OrderStatus.COMPLETED && order.paymentStatus === PaymentStatus.VERIFIED)).toBe(true);
    expect(r.orders.every((order) => order.paymentMethod === PaymentMethod.CASH && order.paidAmount?.toFixed(2) === "500.00")).toBe(true);
    expect(r.closed.receiptKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(r.pollAtPaid.receiptKey).toBe(r.closed.receiptKey);
    expect(r.receiptAtPaid).toMatchObject({ total: "1500.00" });
    expect(r.closedAgain.receiptKey).toBe(r.closed.receiptKey);
    expect(r.tokenAfter).toBeNull();
    expect(r.keyForPhone).toBe(r.closed.receiptKey);
    expect(r.receipt).toMatchObject({ total: "1500.00", subtotal: "1500.00", table: { area: "Family Hall" } });
    expect((r.receipt as { shares: { amount: string }[] }).shares.map((share) => share.amount)).toEqual(["500.00", "500.00", "500.00"]);
    expect(JSON.stringify(r.receipt)).not.toMatch(/Wasim|Test Admin|accountNumber/);
    expect(r.lateProof).toMatchObject({ status: 409, code: "NOT_AWAITING_PAYMENT" });
    expect(sharedFakeIO.emits.some((emit) => emit.event === "table-bill:updated" && (emit.payload as { status: string }).status === "PAID")).toBe(true);
  });

  it("locks the table, guards one-by-one payment, waits for reception, and repeats are harmless", async () => {
    const r = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seat(world, ["Ali", "Sara"]);
      const [ali, sara] = guests;
      const aliOrder = await orderAndAccept(world, ali!, [{ menuItemId: world.burger.id, quantity: 1 }]);
      // Sara's round still waits at reception when the bill is asked for.
      const { result: waiting } = await guestService.createTableOrder(sara!, parseTableOrderBody({ clientRequestId: uuid(), items: [{ menuItemId: world.burger.id, quantity: 1 }], deals: [] }));

      const first = await billService.requestBill(sessionId, ali!.actor);
      const again = await billService.requestBill(sessionId, sara!.actor);
      const splitWhileAwaiting = await caught(billService.setSplit(sessionId, ali!.actor, { mode: SplitMode.EQUAL, parts: 2, expectedVersion: first.bill!.version }));
      await tx.order.updateMany({ where: { tableGuestId: ali!.id }, data: { createdAt: new Date(Date.now() - 60_000) } });
      const locked = await caught(
        guestService.createTableOrder(ali!, parseTableOrderBody({ clientRequestId: uuid(), items: [{ menuItemId: world.burger.id, quantity: 1 }], deals: [] })),
      );
      const complete = await caught(orderService.completeOrder(aliOrder, world.posAdmin.id));
      const markPaid = await caught(orderService.updatePaymentStatus(aliOrder, PaymentStatus.VERIFIED, { actorId: world.posAdmin.id }));
      const discountWhileAwaiting = await caught(
        billService.setBillDiscount(sessionId, staff(world), { discount: D(100), discountReason: "Regulars", expectedVersion: first.bill!.version }),
      );

      await orderService.acceptOrder(waiting.orderId, world.posAdmin.id, {});
      const view = await staffBill(sessionId);
      // A POS admin is capped at 20 % of the bill (1000): 300 needs a Super Admin.
      const overCap = await caught(
        billService.setBillDiscount(sessionId, staff(world), { discount: D(300), discountReason: "Too much", expectedVersion: view.version }),
      );
      const split = await billService.setSplit(sessionId, staff(world), { mode: SplitMode.EQUAL, parts: 2, expectedVersion: view.version });
      // The same request again with the old version: the split it asked for already holds — 200, nothing new.
      const replay = await billService.setSplit(sessionId, staff(world), { mode: SplitMode.EQUAL, parts: 2, expectedVersion: view.version });
      const shareId = split.bill!.shares[0]!.id;
      await billService.markSharePaid(sessionId, staff(world), shareId, null);
      await billService.markSharePaid(sessionId, staff(world), shareId, null);
      const paidEvents = await tx.tableSessionEvent.count({ where: { sessionId, type: "SHARE_PAID" } });
      const unlockWithPayment = await caught(billService.unlockBill(sessionId, staff(world), (await staffBill(sessionId)).version));
      await billService.unmarkShare(sessionId, staff(world), shareId, "Wrong table");
      const unlocked = await billService.unlockBill(sessionId, staff(world), (await staffBill(sessionId)).version);
      const orderAfterUnlock = await guestService.createTableOrder(ali!, parseTableOrderBody({ clientRequestId: uuid(), items: [{ menuItemId: world.burger.id, quantity: 1 }], deals: [] }));
      return { first, again, splitWhileAwaiting, discountWhileAwaiting, locked, complete, markPaid, overCap, split, replay, paidEvents, unlockWithPayment, unlocked, orderAfterUnlock };
    });
    expect(r.again.bill!.version).toBe(r.first.bill!.version);
    expect(r.splitWhileAwaiting).toMatchObject({ status: 409, code: "ORDERS_AWAITING" });
    expect(r.locked).toMatchObject({ status: 409, code: "BILL_LOCKED" });
    expect(r.complete).toMatchObject({ status: 409, code: "USE_TABLE_BILL" });
    expect(r.markPaid).toMatchObject({ status: 409, code: "USE_TABLE_BILL" });
    expect(r.discountWhileAwaiting).toMatchObject({ status: 409, code: "ORDERS_AWAITING" });
    expect(r.overCap).toMatchObject({ status: 403, code: "DISCOUNT_ABOVE_CAP" });
    expect(r.replay.bill!.splitVersion).toBe(r.split.bill!.splitVersion);
    expect(r.paidEvents).toBe(1);
    expect(r.unlockWithPayment).toMatchObject({ status: 409, code: "SPLIT_HAS_PAYMENTS" });
    expect(r.unlocked.bill).toMatchObject({ status: "UNLOCKED", shares: [], splitMode: null });
    expect(r.orderAfterUnlock.isNew).toBe(true);
  });
});
