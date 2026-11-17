import { describe, expect, it, vi } from "vitest";
import { OrderEventType, Prisma } from "../../../generated/prisma/client";
import { createFakeIO, isLocalDb, withRollback } from "../../common/testDb";
import * as orderService from "./order.service";
import { listOrderEvents, recordOrderEvent } from "./orderEvents";
import { seedOrderWorld } from "./orderTestSeed";

// vi.mock is hoisted above the imports: the service runs against the rolled-back test transaction.
vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", () => ({ getIO: () => createFakeIO().io }));

describe("recordOrderEvent", () => {
  function fakeTx() {
    const created: Record<string, unknown>[] = [];
    const tx = { orderEvent: { create: async ({ data }: { data: Record<string, unknown> }) => created.push(data) } };
    return { tx: tx as unknown as Prisma.TransactionClient, created };
  }

  it("trims the reason and stores a blank one as null", async () => {
    const { tx, created } = fakeTx();
    await recordOrderEvent(tx, { orderId: "o", actorId: "s", type: OrderEventType.CANCELLED, reason: "  wrong table  " });
    await recordOrderEvent(tx, { orderId: "o", actorId: "s", type: OrderEventType.CANCELLED, reason: "   " });
    expect(created[0]?.reason).toBe("wrong table");
    expect(created[1]?.reason).toBeNull();
  });

  it("cuts a reason longer than 200 characters to fit the column", async () => {
    const { tx, created } = fakeTx();
    await recordOrderEvent(tx, { orderId: "o", actorId: null, type: OrderEventType.REJECTED, reason: "x".repeat(250) });
    expect(created[0]?.reason).toHaveLength(200);
    expect(created[0]?.actorId).toBeNull();
  });
});

describe.skipIf(!isLocalDb)("order actions write their audit event (local DB, rolled back)", () => {
  it("confirming cash payment with a new discount records DISCOUNT_SET then PAYMENT_MARKED, with the actor's name", async () => {
    const events = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await world.order();
      await orderService.updatePaymentStatus(order.id, "VERIFIED", {
        discount: new Prisma.Decimal(50),
        discountReason: "Regular customer",
        paidAmount: new Prisma.Decimal(600),
        actorId: world.superAdmin.id,
        actorRole: "SUPER_ADMIN",
      });
      return listOrderEvents(order.id);
    });
    expect(events.map((event) => event.type)).toEqual(["DISCOUNT_SET", "PAYMENT_MARKED"]);
    expect(events[0]).toMatchObject({
      actorName: "Sana Super",
      reason: "Regular customer",
      before: { discount: "0.00", totalAmount: "600.00" },
      after: { discount: "50.00", totalAmount: "550.00" },
    });
    expect(events[1]).toMatchObject({ before: { paymentStatus: "PENDING" }, after: { paymentStatus: "VERIFIED", paidAmount: "600.00" } });
  });

  it("re-confirming with the same discount writes no DISCOUNT_SET; marking unpaid writes PAYMENT_UNMARKED", async () => {
    const events = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await world.order({ discount: 20, paymentStatus: "VERIFIED" });
      await orderService.updatePaymentStatus(order.id, "VERIFIED", { discount: new Prisma.Decimal(20), actorId: world.posAdmin.id });
      await orderService.updatePaymentStatus(order.id, "PENDING", { actorId: world.posAdmin.id });
      return listOrderEvents(order.id);
    });
    expect(events.map((event) => event.type)).toEqual(["PAYMENT_UNMARKED"]);
  });

  it("removing and adding items record ITEM_REMOVED / ITEM_ADDED with the totals", async () => {
    const events = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await world.order();
      const tea = order.items.find((item) => item.menuItemId === world.tea.id)!;
      await orderService.removeOrderItem(order.id, tea.id, world.posAdmin.id);
      await orderService.addOrderItems(order.id, { items: [{ menuItemId: world.tea.id, quantity: 2 }], performedById: world.posAdmin.id });
      return listOrderEvents(order.id);
    });
    expect(events.map((event) => event.type)).toEqual(["ITEM_REMOVED", "ITEM_ADDED"]);
    expect(events[0]).toMatchObject({ before: { item: "1 × Test Tea", totalAmount: "600.00" }, after: { totalAmount: "500.00" } });
    expect(events[1]).toMatchObject({ before: { totalAmount: "500.00" }, after: { totalAmount: "700.00", items: ["2 × Test Tea"] } });
  });

  it("accepting and rejecting at reception record ACCEPTED / REJECTED", async () => {
    const events = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const accepted = await world.order({ status: "AWAITING_RECEPTION" });
      const rejected = await world.order({ status: "AWAITING_RECEPTION" });
      await orderService.acceptOrder(accepted.id, world.posAdmin.id, {});
      await orderService.rejectOrder(rejected.id, { reason: "Kitchen closed" }, world.posAdmin.id);
      return [...(await listOrderEvents(accepted.id)), ...(await listOrderEvents(rejected.id))];
    });
    expect(events.map((event) => event.type)).toEqual(["ACCEPTED", "REJECTED"]);
    expect(events[0]).toMatchObject({ before: { status: "AWAITING_RECEPTION" }, after: { status: "PENDING" } });
    expect(events[1]).toMatchObject({ reason: "Kitchen closed", after: { status: "CANCELLED" } });
  });
});
