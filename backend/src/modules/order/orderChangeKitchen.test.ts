import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderChangeKind, StaffRole } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as orderService from "./order.service";
import { seedOrderWorld } from "./orderTestSeed";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

beforeEach(() => {
  sharedFakeIO.emits.length = 0;
});

// An approved order-taker EDIT deletes and recreates every line of an order the kitchens already have.
// They must drop the old cards and get the new ones (it used to tell them nothing).
describe.skipIf(!isLocalDb)("approved EDIT change request notifies the kitchens (local DB, rolled back)", () => {
  it("sends order-item:removed for every old line and order-item:new for the rebuilt ones, per kitchen", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const taker = await tx.staffUser.create({
        data: { name: "Taker", username: `taker-${Date.now()}`, passwordHash: "x", role: StaffRole.ORDER_TAKER },
      });
      // An accepted dine-in order-taker order: burger (kitchen A) + tea (kitchen B).
      const order = await world.order({ source: "ORDER_TAKER", type: "DINE_IN", status: "PENDING", placedByStaffId: taker.id });
      const change = await orderService.createOrderChange({
        orderId: order.id,
        requestedById: taker.id,
        kind: OrderChangeKind.EDIT,
        requestedState: { items: [{ menuItemId: world.burger.id, quantity: 2 }] },
      });
      sharedFakeIO.emits.length = 0;
      await orderService.reviewOrderChange(change.id, world.posAdmin.id, true);
      const rebuilt = await tx.orderItem.findMany({ where: { orderId: order.id } });
      return { world, order, rebuilt };
    });

    const { world, order, rebuilt } = result;
    const oldBurger = order.items.find((item) => item.menuItemId === world.burger.id)!;
    const oldTea = order.items.find((item) => item.menuItemId === world.tea.id)!;
    const removed = sharedFakeIO.emits.filter((emit) => emit.event === "order-item:removed");
    expect(removed).toEqual(
      expect.arrayContaining([
        { rooms: [`kitchen:${world.kitchenA.id}`], event: "order-item:removed", payload: expect.objectContaining({ itemIds: [oldBurger.id] }) },
        { rooms: [`kitchen:${world.kitchenB.id}`], event: "order-item:removed", payload: expect.objectContaining({ itemIds: [oldTea.id] }) },
      ]),
    );
    const added = sharedFakeIO.emits.filter((emit) => emit.event === "order-item:new");
    expect(added).toHaveLength(1);
    expect(added[0]!.rooms).toEqual([`kitchen:${world.kitchenA.id}`]);
    expect((added[0]!.payload as { items: { id: string }[] }).items.map((item) => item.id)).toEqual(rebuilt.map((item) => item.id));
  });
});
