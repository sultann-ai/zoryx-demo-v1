import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryTxnType, Prisma, StaffRole } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as inventoryService from "../inventory/inventory.service";
import * as orderService from "./order.service";
import { listOrderEvents } from "./orderEvents";
import { seedOrderWorld } from "./orderTestSeed";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

const SA = { actorRole: StaffRole.SUPER_ADMIN };

beforeEach(() => {
  sharedFakeIO.emits.length = 0;
});

type World = Awaited<ReturnType<typeof seedOrderWorld>>;

// A live POS order whose burger deducted 2 buns, as createOrder does for a staff-placed order.
async function placedOrder(tx: Prisma.TransactionClient, world: World, over: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
  const order = await world.order(over);
  await inventoryService.deductForOrderItems(tx, {
    orderId: order.id,
    performedById: world.posAdmin.id,
    items: order.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
  });
  return order;
}

const bunStock = async (tx: Prisma.TransactionClient, world: World) =>
  (await tx.inventoryItem.findUniqueOrThrow({ where: { id: world.bun.id } })).currentStock.toString();

describe.skipIf(!isLocalDb)("cancelOrder (local DB, rolled back)", () => {
  it("cancels a paid order: returns its stock once, records who/when/why and 'paid', tells each kitchen", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await placedOrder(tx, world, { paymentStatus: "VERIFIED" });
      const stockAfterOrder = await bunStock(tx, world);
      const cancelled = await orderService.cancelOrder(order.id, { reason: "Customer left", actorId: world.superAdmin.id, ...SA });
      const ledger = await tx.inventoryTransaction.findMany({ where: { relatedOrderId: order.id }, orderBy: { createdAt: "asc" } });
      return { world, order, cancelled, stockAfterOrder, stockNow: await bunStock(tx, world), ledger, events: await listOrderEvents(order.id) };
    });

    expect(result.stockAfterOrder).toBe("98");
    expect(result.stockNow).toBe("100");
    expect(result.ledger.map((row) => row.type)).toEqual([InventoryTxnType.STOCK_OUT, InventoryTxnType.RESTOCK_CANCEL]);
    expect(result.cancelled).toMatchObject({ status: "CANCELLED", cancelledReason: "Customer left", cancelledById: result.world.superAdmin.id });
    expect(result.cancelled.cancelledAt).toBeInstanceOf(Date);
    expect(result.events).toEqual([
      expect.objectContaining({
        type: "CANCELLED",
        reason: "Customer left",
        before: expect.objectContaining({ paid: true, status: "PENDING", totalAmount: "600.00" }),
        after: { status: "CANCELLED", restocked: true },
      }),
    ]);

    const burger = result.order.items.find((item) => item.menuItemId === result.world.burger.id)!;
    const tea = result.order.items.find((item) => item.menuItemId === result.world.tea.id)!;
    const cancelEmits = sharedFakeIO.emits.filter((emit) => emit.event === "order:cancelled");
    expect(cancelEmits).toEqual(
      expect.arrayContaining([
        { rooms: [`kitchen:${result.world.kitchenA.id}`], event: "order:cancelled", payload: expect.objectContaining({ itemIds: [burger.id] }) },
        { rooms: [`kitchen:${result.world.kitchenB.id}`], event: "order:cancelled", payload: expect.objectContaining({ itemIds: [tea.id] }) },
        { rooms: ["pos-admin"], event: "order:cancelled", payload: expect.objectContaining({ orderId: result.order.id }) },
      ]),
    );
  });

  it("refuses a second cancel with 409 and never restocks twice", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await placedOrder(tx, world);
      await orderService.cancelOrder(order.id, { reason: "first", actorId: world.superAdmin.id, ...SA });
      const second = await orderService.cancelOrder(order.id, { reason: "again", actorId: world.superAdmin.id, ...SA }).catch((error) => error);
      // Even if something re-ran the restock directly, the ledger already has a RESTOCK_CANCEL.
      const direct = await inventoryService.restockForCancelledOrder(tx, { orderId: order.id, performedById: world.superAdmin.id });
      return { second, direct, stock: await bunStock(tx, world) };
    });
    expect(result.second).toBeInstanceOf(orderService.OrderNotCancellableError);
    expect(result.second.message).toBe("This order is already cancelled");
    expect(result.direct).toEqual({ restocked: false });
    expect(result.stock).toBe("100");
  });

  it("refuses COMPLETED (\"Completed orders can't be cancelled\") and SCHEDULED orders", async () => {
    const errors = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const completed = await world.order({ status: "COMPLETED" });
      const scheduled = await world.order({ status: "SCHEDULED", scheduledFor: new Date(Date.now() + 3_600_000) });
      const cancel = (id: string) => orderService.cancelOrder(id, { reason: "x", actorId: world.superAdmin.id, ...SA }).catch((error) => error);
      return [await cancel(completed.id), await cancel(scheduled.id)];
    });
    expect(errors[0]).toBeInstanceOf(orderService.OrderNotCancellableError);
    expect(errors[0].message).toBe("Completed orders can't be cancelled");
    expect(errors[1]).toBeInstanceOf(orderService.OrderNotCancellableError);
    expect(errors[1].status).toBe("SCHEDULED");
  });

  it("a gated order never accepted returns no stock and tells no kitchen; once accepted, it does", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const gated = await world.order({ status: "AWAITING_RECEPTION" });
      await orderService.cancelOrder(gated.id, { reason: "duplicate", actorId: world.posAdmin.id, actorRole: StaffRole.POS_ADMIN });
      const gatedEmits = sharedFakeIO.emits.splice(0).map((emit) => emit.rooms[0]);
      const gatedLedger = await tx.inventoryTransaction.count({ where: { relatedOrderId: gated.id } });

      const accepted = await world.order({ status: "AWAITING_RECEPTION" });
      await orderService.acceptOrder(accepted.id, world.posAdmin.id, {});
      const stockAfterAccept = await bunStock(tx, world);
      await orderService.cancelOrder(accepted.id, { reason: "changed mind", actorId: world.posAdmin.id, actorRole: StaffRole.POS_ADMIN });
      return { gatedEmits, gatedLedger, stockAfterAccept, stock: await bunStock(tx, world), events: await listOrderEvents(gated.id) };
    });
    expect(result.gatedLedger).toBe(0);
    expect(result.gatedEmits).toEqual(["pos-admin"]);
    expect(result.events[0]?.after).toEqual({ status: "CANCELLED", restocked: false });
    expect(result.stockAfterAccept).toBe("98");
    expect(result.stock).toBe("100");
  });

  it("after an item was removed, returns only what the remaining items deducted", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await placedOrder(tx, world); // 100 -> 98
      await orderService.addOrderItems(order.id, { items: [{ menuItemId: world.burger.id, quantity: 2 }], performedById: world.posAdmin.id });
      const extra = (await tx.orderItem.findMany({ where: { orderId: order.id, menuItemId: world.burger.id, quantity: 2 } }))[0]!;
      await orderService.removeOrderItem(order.id, extra.id, world.posAdmin.id); // 94 -> 98
      const removeEmit = sharedFakeIO.emits.find((emit) => emit.event === "order-item:removed" && emit.rooms[0] === `kitchen:${world.kitchenA.id}`);
      await orderService.cancelOrder(order.id, { reason: "x", actorId: world.superAdmin.id, ...SA });
      const returned = await tx.inventoryTransaction.findMany({ where: { relatedOrderId: order.id, type: "RESTOCK_CANCEL" } });
      return { removeEmit, extraId: extra.id, returned, stock: await bunStock(tx, world) };
    });
    expect(result.returned.map((row) => row.quantity.toString())).toEqual(["2"]);
    expect(result.stock).toBe("100");
    expect(result.removeEmit?.payload).toMatchObject({ itemIds: [result.extraId] });
  });

  it("an order taker can't cancel their own awaiting order once reception has taken payment", async () => {
    const error = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const taker = await tx.staffUser.create({ data: { name: "Tariq", username: `taker-${Date.now()}`, passwordHash: "x", role: "ORDER_TAKER" } });
      const order = await world.order({ status: "AWAITING_RECEPTION", source: "ORDER_TAKER", placedByStaffId: taker.id, paymentStatus: "VERIFIED" });
      return orderService.cancelOwnAwaitingOrder(order.id, taker.id).catch((caught) => caught);
    });
    expect(error).toBeInstanceOf(orderService.PaidOrderCancelForbiddenError);
  });
});
