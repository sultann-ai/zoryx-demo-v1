import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as orderService from "./order.service";
import { listOrderEvents } from "./orderEvents";
import { seedOrderWorld } from "./orderTestSeed";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

beforeEach(() => {
  sharedFakeIO.emits.length = 0;
});

const itemStatuses = (tx: Prisma.TransactionClient, orderId: string) =>
  tx.orderItem.findMany({ where: { orderId }, select: { status: true } }).then((rows) => rows.map((row) => row.status));

async function setAutoComplete(tx: Prisma.TransactionClient, on: boolean) {
  await tx.siteSettings.upsert({
    where: { id: 1 },
    update: { autoCompleteTakeawayOnPayment: on },
    create: {
      id: 1,
      shopNameEn: "t",
      shopNameUr: "t",
      taglineEn: "t",
      taglineUr: "t",
      phone: "0300 0000000",
      whatsappNumber: "923000000000",
      addressEn: "t",
      addressUr: "t",
      mapUrl: "https://maps.google.com",
      openingHoursEn: "t",
      openingHoursUr: "t",
      autoCompleteTakeawayOnPayment: on,
    },
  });
}

describe.skipIf(!isLocalDb)("completeOrder (local DB, rolled back)", () => {
  it("completes a paid order: COMPLETED, items SERVED, a COMPLETED event with the actor, kitchens told", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await world.order({ type: "DINE_IN", paymentStatus: "VERIFIED" });
      await tx.orderItem.update({ where: { id: order.items[0]!.id }, data: { status: "READY" } });
      const completed = await orderService.completeOrder(order.id, world.posAdmin.id);
      return { world, order, completed, statuses: await itemStatuses(tx, order.id), events: await listOrderEvents(order.id) };
    });

    expect(result.completed.status).toBe("COMPLETED");
    expect(result.statuses).toEqual(["SERVED", "SERVED"]);
    expect(result.events).toEqual([
      expect.objectContaining({
        type: "COMPLETED",
        actorName: "Pervez Pos",
        before: { status: "PENDING", paymentStatus: "VERIFIED" },
        after: { status: "COMPLETED", via: "complete" },
      }),
    ]);
    const gone = sharedFakeIO.emits.filter((emit) => emit.event === "order:completed");
    expect(gone).toEqual(
      expect.arrayContaining([
        { rooms: [`kitchen:${result.world.kitchenA.id}`], event: "order:completed", payload: expect.objectContaining({ orderId: result.order.id }) },
        { rooms: [`kitchen:${result.world.kitchenB.id}`], event: "order:completed", payload: expect.objectContaining({ orderId: result.order.id }) },
      ]),
    );
  });

  it("completes any source and type: an online delivery order that's CONFIRMED and paid", async () => {
    const completed = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await world.order({
        source: "ONLINE",
        type: "DELIVERY",
        status: "CONFIRMED",
        paymentMethod: "ONLINE",
        paymentStatus: "VERIFIED",
      });
      return orderService.completeOrder(order.id, world.superAdmin.id);
    });
    expect(completed.status).toBe("COMPLETED");
  });

  it("refuses an unpaid order and leaves it as it was", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await world.order({ type: "DINE_IN" });
      const error = await orderService.completeOrder(order.id, world.posAdmin.id).catch((caught) => caught);
      const now = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      return { error, status: now.status, events: await listOrderEvents(order.id) };
    });
    expect(result.error).toBeInstanceOf(orderService.OrderUnpaidError);
    expect(result.status).toBe("PENDING");
    expect(result.events).toEqual([]);
  });

  it("refuses cancelled, completed, awaiting-reception and scheduled orders with NotCompletable", async () => {
    const errors = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const out: unknown[] = [];
      for (const status of ["CANCELLED", "COMPLETED", "AWAITING_RECEPTION", "SCHEDULED"] as const) {
        const order = await world.order({ status, paymentStatus: "VERIFIED" });
        out.push(await orderService.completeOrder(order.id, world.posAdmin.id).catch((caught) => caught));
      }
      return out;
    });
    for (const error of errors) {
      expect(error).toBeInstanceOf(orderService.OrderNotCompletableError);
    }
    expect((errors[1] as Error).message).toBe("This order is already completed");
  });

  it("Mark delivered records the same COMPLETED event, with who did it", async () => {
    const events = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await world.order({ source: "ONLINE", type: "DELIVERY", status: "CONFIRMED" });
      await orderService.markOrderDelivered(order.id, world.posAdmin.id);
      return listOrderEvents(order.id);
    });
    expect(events).toEqual([
      expect.objectContaining({ type: "COMPLETED", actorName: "Pervez Pos", after: { status: "COMPLETED", via: "delivered" } }),
    ]);
  });
});

describe.skipIf(!isLocalDb)("auto-complete a POS takeaway when it's marked paid (local DB, rolled back)", () => {
  it("completes a POS takeaway on payment when the switch is on (the default)", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      await setAutoComplete(tx, true);
      const order = await world.order({ type: "TAKEAWAY" });
      const paid = await orderService.updatePaymentStatus(order.id, "VERIFIED", {
        paidAmount: new Prisma.Decimal(1000),
        actorId: world.posAdmin.id,
      });
      return { paid, statuses: await itemStatuses(tx, order.id), events: await listOrderEvents(order.id) };
    });
    expect(result.paid.status).toBe("COMPLETED");
    expect(result.paid.paymentStatus).toBe("VERIFIED");
    expect(result.paid.paidAmount?.toFixed(2)).toBe("1000.00");
    expect(result.statuses).toEqual(["SERVED", "SERVED"]);
    expect(result.events.map((event) => event.type)).toEqual(["PAYMENT_MARKED", "COMPLETED"]);
    expect(result.events[1]).toMatchObject({ actorName: "Pervez Pos", after: { status: "COMPLETED", auto: true, via: "auto" } });
  });

  it("leaves dine-in, online and order-taker orders open, and every takeaway when the switch is off", async () => {
    const statuses = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      await setAutoComplete(tx, true);
      const dineIn = await world.order({ type: "DINE_IN" });
      const online = await world.order({ source: "ONLINE", type: "TAKEAWAY", status: "CONFIRMED" });
      const taker = await world.order({ source: "ORDER_TAKER", type: "TAKEAWAY" });
      for (const order of [dineIn, online, taker]) {
        await orderService.updatePaymentStatus(order.id, "VERIFIED", { actorId: world.posAdmin.id });
      }
      await setAutoComplete(tx, false);
      const takeaway = await world.order({ type: "TAKEAWAY" });
      await orderService.updatePaymentStatus(takeaway.id, "VERIFIED", { actorId: world.posAdmin.id });
      const rows = await tx.order.findMany({
        where: { id: { in: [dineIn.id, online.id, taker.id, takeaway.id] } },
        select: { id: true, status: true },
      });
      const byId = new Map(rows.map((row) => [row.id, row.status]));
      return [dineIn, online, taker, takeaway].map((order) => byId.get(order.id));
    });
    expect(statuses).toEqual(["PENDING", "CONFIRMED", "PENDING", "PENDING"]);
  });
});

describe.skipIf(!isLocalDb)("kitchen queue (local DB, rolled back)", () => {
  it("never brings back a cancelled or completed order's items on a refetch", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const live = await world.order({ type: "DINE_IN" });
      await world.order({ status: "CANCELLED" });
      await world.order({ status: "COMPLETED" });
      return { live, rows: await orderService.getKitchenQueue(world.kitchenA.id) };
    });
    expect(result.rows.map((row) => row.orderId)).toEqual([result.live.id]);
  });

  it("keeps READY items (they still need Mark Served) and drops SERVED ones", async () => {
    const statuses = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const ready = await world.order({ type: "DINE_IN" });
      const served = await world.order({ type: "DINE_IN" });
      const burgerOf = (order: typeof ready) => order.items.find((item) => item.kitchenId === world.kitchenA.id)!.id;
      await tx.orderItem.update({ where: { id: burgerOf(ready) }, data: { status: "READY" } });
      await tx.orderItem.update({ where: { id: burgerOf(served) }, data: { status: "SERVED" } });
      const rows = await orderService.getKitchenQueue(world.kitchenA.id);
      return rows.map((row) => [row.orderId === ready.id ? "ready-order" : "served-order", row.status]);
    });
    expect(statuses).toEqual([["ready-order", "READY"]]);
  });
});
