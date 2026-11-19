import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, StaffRole } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as orderService from "../order/order.service";
import * as sessionService from "../table/tableSession.service";
import { parseTableOrderBody, TableGuestValidationError } from "./tableGuest.validators";
import * as guestService from "./tableGuest.service";
import { seedTableWorld } from "./tableQrTestSeed";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

beforeEach(() => {
  sharedFakeIO.emits.length = 0;
});

type World = Awaited<ReturnType<typeof seedTableWorld>>;

let uuidCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${String((uuidCounter += 1)).padStart(12, "0")}`;

// Seat the table and join one or more guests through the real services; returns each guest as the
// token middleware would resolve it.
async function seatAndJoin(world: World, names: string[] = ["Ali"]) {
  const seated = await sessionService.seatTable(world.table.id, { id: world.waiter.id, role: StaffRole.ORDER_TAKER });
  const guests = [];
  for (const name of names) {
    const { result } = await guestService.joinTable(world.table.qrKey as string, { displayName: name, pin: undefined, joinRequestId: uuid() }, "10.0.0.1");
    guests.push((await guestService.authenticateGuest(result.token))!);
  }
  return { sessionId: seated.session.id, guests };
}

const round = (items: unknown[], deals: unknown[] = [], clientRequestId = uuid()) =>
  parseTableOrderBody({ clientRequestId, items, deals });

// Moves a guest's rounds back in time so the 30-second cooldown doesn't get in the way of a test.
const pastCooldown = (tx: Prisma.TransactionClient, guestId: string) =>
  tx.order.updateMany({ where: { tableGuestId: guestId }, data: { createdAt: new Date(Date.now() - 60_000) } });

const refusal = (error: unknown) =>
  error instanceof guestService.TableGuestError ? { status: error.status, code: error.code, ...error.extra } : error;

describe.skipIf(!isLocalDb)("Table QR orders (local DB, rolled back)", () => {
  it("prices on the server, tags every line (deal lines and exploded items too) and lands at reception as TABLE_QR", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seatAndJoin(world);
      const { result: placed, isNew } = await guestService.createTableOrder(
        guests[0]!,
        round([{ menuItemId: world.burger.id, quantity: 2 }], [{ dealId: world.deal.id, quantity: 1 }]),
      );
      const order = await tx.order.findUniqueOrThrow({ where: { id: placed.orderId }, include: { items: true, dealLines: true } });
      const incoming = await orderService.getIncomingOrders(world.activeDay.id);
      return { world, sessionId, guest: guests[0]!, placed, isNew, order, incoming };
    });

    // 2 × 500 burger + one 900 deal: the server's prices, nothing from the client.
    expect(result.isNew).toBe(true);
    expect(result.placed).toMatchObject({ status: "RECEIVED", total: "1900" });
    expect(result.order).toMatchObject({
      source: "TABLE_QR",
      type: "DINE_IN",
      status: "AWAITING_RECEPTION",
      paymentMethod: "CASH",
      diningAreaId: result.world.table.id,
      tableSessionId: result.sessionId,
      tableGuestId: result.guest.id,
      placedByStaffId: null,
    });
    // One direct burger line + the deal's two exploded burgers, all tagged, plus the tagged deal line.
    expect(result.order.items).toHaveLength(2);
    expect(result.order.items.every((item) => item.tableGuestId === result.guest.id)).toBe(true);
    expect(result.order.dealLines.map((line) => line.tableGuestId)).toEqual([result.guest.id]);
    expect(result.incoming.map((order) => order.id)).toContain(result.order.id);

    const submitted = sharedFakeIO.emits.find((emit) => emit.event === "order:submitted");
    expect(submitted).toMatchObject({
      rooms: ["pos-admin"],
      payload: { source: "TABLE_QR", tableSessionId: result.sessionId, tableGuestName: "Ali" },
    });
    // The floor map hears it, and no kitchen does until reception accepts.
    expect(sharedFakeIO.emits.some((emit) => emit.event === "table:updated" && (emit.payload as { state: string }).state === "ORDER_AWAITING")).toBe(true);
    expect(sharedFakeIO.emits.some((emit) => emit.event === "order-item:new")).toBe(false);
  });

  it("never takes a price from the client: a unitPrice on a line is refused before anything is read", () => {
    expect(() =>
      parseTableOrderBody({ clientRequestId: uuid(), items: [{ menuItemId: "m", quantity: 1, unitPrice: "1.00" }] }),
    ).toThrow(TableGuestValidationError);
  });

  it("rejects an item hidden from the QR menu, an open-price item, and a hidden deal", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world);
      const hidden = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.tea.id, quantity: 1 }])).catch((e) => e);
      const openPrice = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.cake.id, quantity: 1 }])).catch((e) => e);
      await tx.deal.update({ where: { id: world.deal.id }, data: { isAvailableOnQr: false } });
      const hiddenDeal = await guestService.createTableOrder(guests[0]!, round([], [{ dealId: world.deal.id, quantity: 1 }])).catch((e) => e);
      return { hidden, openPrice, hiddenDeal, orders: await tx.order.count({ where: { tableGuestId: guests[0]!.id } }) };
    });
    expect(result.hidden).toBeInstanceOf(orderService.ItemNotOrderableOnlineError);
    expect(result.openPrice).toBeInstanceOf(orderService.ItemNotOrderableOnlineError);
    expect(result.hiddenDeal).toBeInstanceOf(orderService.ItemNotOrderableOnlineError);
    expect(result.orders).toBe(0);
  });

  it("is idempotent on clientRequestId: the same guest gets the same order back; another guest gets 409", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, ["Ali", "Sara"]);
      const body = round([{ menuItemId: world.burger.id, quantity: 1 }]);
      const first = await guestService.createTableOrder(guests[0]!, body);
      const again = await guestService.createTableOrder(guests[0]!, body);
      const stolen = await guestService.createTableOrder(guests[1]!, body).catch(refusal);
      return { first, again, stolen, count: await tx.order.count({ where: { clientRequestId: body.clientRequestId } }) };
    });
    expect(result.first.isNew).toBe(true);
    expect(result.again).toEqual({ result: result.first.result, isNew: false });
    expect(result.stolen).toMatchObject({ status: 409, code: "REQUEST_ID_REUSED" });
    expect(result.count).toBe(1);
  });

  it("enforces the cooldown, the per-guest and the per-session awaiting limits, and the round total cap", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, ["Ali", "Sara", "Omar"]);
      const burger = [{ menuItemId: world.burger.id, quantity: 1 }];
      await guestService.createTableOrder(guests[0]!, round(burger));
      const cooldown = await guestService.createTableOrder(guests[0]!, round(burger)).catch(refusal);
      await pastCooldown(tx, guests[0]!.id);
      await guestService.createTableOrder(guests[0]!, round(burger));
      await pastCooldown(tx, guests[0]!.id);
      const guestCap = await guestService.createTableOrder(guests[0]!, round(burger)).catch(refusal);
      // Session: Ali has 2 awaiting; Sara brings it to 4; Omar is refused.
      await guestService.createTableOrder(guests[1]!, round(burger));
      await pastCooldown(tx, guests[1]!.id);
      await guestService.createTableOrder(guests[1]!, round(burger));
      const sessionCap = await guestService.createTableOrder(guests[2]!, round(burger)).catch(refusal);
      return { cooldown, guestCap, sessionCap };
    });
    expect(result.cooldown).toMatchObject({ status: 429, code: "COOLDOWN" });
    expect((result.cooldown as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(0);
    expect(result.guestCap).toMatchObject({ status: 429, code: "TOO_MANY" });
    expect(result.sessionCap).toMatchObject({ status: 429, code: "TOO_MANY" });
  });

  it("caps one round's server-priced total at 50,000", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, ["Ali", "Sara"]);
      const line = (notes: string) => ({ menuItemId: world.burger.id, quantity: 50, notes });
      // 100 × 500 = 50,000: allowed. 150 × 500 = 75,000: refused, nothing written.
      const atCap = await guestService.createTableOrder(guests[0]!, round([line("a"), line("b")]));
      const overCap = await guestService.createTableOrder(guests[1]!, round([line("a"), line("b"), line("c")])).catch((e) => e);
      return { atCap, overCap, saraOrders: await tx.order.count({ where: { tableGuestId: guests[1]!.id } }) };
    });
    expect(result.atCap.result.total).toBe("50000");
    expect(result.overCap).toBeInstanceOf(orderService.OrderTooLargeError);
    expect(result.saraOrders).toBe(0);
  });

  it("refuses a round once the session is closed (token dead), and when QR ordering is switched off", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seatAndJoin(world);
      await tx.siteSettings.update({ where: { id: 1 }, data: { tableQrEnabled: false } });
      const switchedOff = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.burger.id, quantity: 1 }])).catch(refusal);
      await tx.siteSettings.update({ where: { id: 1 }, data: { tableQrEnabled: true } });
      await sessionService.closeSession(sessionId, world.waiter.id);
      const afterClose = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.burger.id, quantity: 1 }])).catch(refusal);
      const reauth = await guestService.authenticateGuest("x".repeat(43));
      return { switchedOff, afterClose, reauth, orders: await tx.order.count({ where: { tableSessionId: sessionId } }) };
    });
    expect(result.switchedOff).toMatchObject({ status: 409, code: "QR_DISABLED" });
    expect(result.afterClose).toMatchObject({ status: 401, code: "SESSION_ENDED" });
    expect(result.reauth).toBeNull();
    expect(result.orders).toBe(0);
  });

  it("goes through reception like an order-taker order: accept → PENDING + kitchens; reject → CANCELLED", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, ["Ali", "Sara"]);
      const a = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      const b = await guestService.createTableOrder(guests[1]!, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      sharedFakeIO.emits.length = 0;
      const accepted = await orderService.acceptOrder(a.result.orderId, world.posAdmin.id, {});
      const kitchenEmits = sharedFakeIO.emits.filter((emit) => emit.event === "order-item:new");
      const rejected = await orderService.rejectOrder(b.result.orderId, { reason: "Kitchen closed" }, world.posAdmin.id);
      const poll = await guestService.getSessionPoll(guests[1]!);
      return { world, accepted, kitchenEmits, rejected, poll };
    });
    expect(result.accepted.status).toBe("PENDING");
    expect(result.kitchenEmits).toEqual([
      expect.objectContaining({ rooms: [`kitchen:${result.world.kitchenA.id}`] }),
    ]);
    expect(result.rejected).toMatchObject({ status: "CANCELLED", cancelledReason: "Kitchen closed" });
    // The guest's poll shows both rounds: Ali's sent to the kitchen, Sara's (mine) cancelled with the reason.
    expect(result.poll.rounds.map((r) => [r.guestName, r.isMine, r.status, r.cancelReason])).toEqual([
      ["Ali", false, "SENT_TO_KITCHEN", null],
      ["Sara", true, "CANCELLED", "Kitchen closed"],
    ]);
  });

  it("keeps the guest tag on every line through a reception edit", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world);
      const placed = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      await orderService.updateSubmission(placed.result.orderId, {
        items: [{ menuItemId: world.burger.id, quantity: 3 }],
        deals: [{ dealId: world.deal.id, quantity: 1 }],
        actorId: world.posAdmin.id,
        actorRole: StaffRole.POS_ADMIN,
      });
      return { guest: guests[0]!, order: await tx.order.findUniqueOrThrow({ where: { id: placed.result.orderId }, include: { items: true, dealLines: true } }) };
    });
    expect(result.order.items.length).toBe(2);
    expect(result.order.items.every((item) => item.tableGuestId === result.guest.id)).toBe(true);
    expect(result.order.dealLines.every((line) => line.tableGuestId === result.guest.id)).toBe(true);
  });

  it("lets a guest cancel their own round while it waits, but not someone else's", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, ["Ali", "Sara"]);
      const mine = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      const notMine = await guestService.cancelOwnRound(guests[1]!, mine.result.orderId).catch(refusal);
      const cancelled = await guestService.cancelOwnRound(guests[0]!, mine.result.orderId);
      const again = await guestService.cancelOwnRound(guests[0]!, mine.result.orderId).catch(refusal);
      return { notMine, cancelled, again, order: await tx.order.findUniqueOrThrow({ where: { id: mine.result.orderId } }) };
    });
    expect(result.notMine).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(result.cancelled).toEqual({ status: "CANCELLED" });
    expect(result.again).toMatchObject({ status: 409, code: "NOT_CANCELLABLE" });
    expect(result.order).toMatchObject({ status: "CANCELLED", cancelledReason: orderService.TABLE_GUEST_CANCEL_REASON, cancelledById: null });
  });
});

describe.skipIf(!isLocalDb)("Table QR sessions with orders (local DB, rolled back)", () => {
  it("closes only once every order is finished, and the floor shows the right states", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seatAndJoin(world);
      const placed = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      const stateAwaiting = (await sessionService.getFloor()).tables.find((t) => t.id === world.table.id)?.state;
      const blocked = await sessionService.closeSession(sessionId, world.waiter.id).catch((e) => e);
      await orderService.acceptOrder(placed.result.orderId, world.posAdmin.id, {});
      const stateKitchen = (await sessionService.getFloor()).tables.find((t) => t.id === world.table.id)?.state;
      await tx.order.update({ where: { id: placed.result.orderId }, data: { paymentStatus: "VERIFIED" } });
      await orderService.completeOrder(placed.result.orderId, world.posAdmin.id);
      const closed = await sessionService.closeSession(sessionId, world.waiter.id);
      const stateAfter = (await sessionService.getFloor()).tables.find((t) => t.id === world.table.id)?.state;
      return { stateAwaiting, blocked, stateKitchen, closed, stateAfter };
    });
    expect(result.stateAwaiting).toBe("ORDER_AWAITING");
    expect(result.blocked).toMatchObject({ status: 409, code: "SESSION_HAS_OPEN_ORDERS" });
    expect(result.stateKitchen).toBe("IN_KITCHEN");
    expect(result.closed.session.status).toBe("CLOSED");
    expect(result.stateAfter).toBe("EMPTY");
  });

  it("the poll's version moves with every change, so an unchanged poll can answer 304", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seatAndJoin(world);
      const v1 = await guestService.getSessionVersion(sessionId);
      const placed = await guestService.createTableOrder(guests[0]!, round([{ menuItemId: world.burger.id, quantity: 1 }]));
      const v2 = await guestService.getSessionVersion(sessionId);
      await orderService.acceptOrder(placed.result.orderId, world.posAdmin.id, {});
      const v3 = await guestService.getSessionVersion(sessionId);
      return { v1, v2, v3 };
    });
    expect(result.v2!).toBeGreaterThan(result.v1!);
    expect(result.v3!).toBeGreaterThan(result.v2!);
  });
});
