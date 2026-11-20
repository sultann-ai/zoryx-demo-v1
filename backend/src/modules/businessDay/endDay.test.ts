import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import { isLocalDb, withRollback } from "../../common/testDb";
import { seedOrderWorld } from "../order/orderTestSeed";
import * as controller from "./businessDay.controller";
import * as service from "./businessDay.service";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../order/order.service", () => ({ listScheduledOrdersForBusinessDay: async () => [] }));

function fakeResponse() {
  const res = { statusCode: 200, body: undefined as unknown };
  const response = {
    status(code: number) {
      res.statusCode = code;
      return response;
    },
    json(body: unknown) {
      res.body = body;
      return response;
    },
  };
  return { res, response: response as unknown as Response };
}

const request = (body: unknown) => ({ staff: { id: "staff-1", role: "POS_ADMIN", kitchenId: null }, body }) as unknown as Request;

describe("POST /business-day/end with unpaid orders", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("lists the unpaid orders by number and amount before it lets the day end", async () => {
    vi.spyOn(service, "getActiveBusinessDay").mockResolvedValue({ id: "day-1" } as Awaited<ReturnType<typeof service.getActiveBusinessDay>>);
    vi.spyOn(service, "getBlockingOrders").mockResolvedValue([]);
    vi.spyOn(service, "getOpenTableSessions").mockResolvedValue([]);
    vi.spyOn(service, "getUnpaidOrders").mockResolvedValue({
      orders: [
        { id: "o-7", orderNumber: 7, totalAmount: new Prisma.Decimal(1200), status: "COMPLETED", paymentMethod: "CASH" },
        { id: "o-9", orderNumber: 9, totalAmount: new Prisma.Decimal(350), status: "PENDING", paymentMethod: "CASH" },
      ],
      total: new Prisma.Decimal(1550),
    });
    const end = vi.spyOn(service, "endBusinessDay");
    const { res, response } = fakeResponse();

    await controller.end(request({}), response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: "UNPAID_ORDERS",
      error: "Cannot end business day: 2 order(s) are not marked paid (Rs 1550.00, not counted in sales)",
      unpaidOrders: [{ orderNumber: 7 }, { orderNumber: 9 }],
    });
    expect(end).not.toHaveBeenCalled();
  });

  it("lists tables still seated (Table QR) and refuses with OPEN_TABLE_SESSIONS when nothing else blocks", async () => {
    vi.spyOn(service, "getActiveBusinessDay").mockResolvedValue({ id: "day-1" } as Awaited<ReturnType<typeof service.getActiveBusinessDay>>);
    vi.spyOn(service, "getBlockingOrders").mockResolvedValue([]);
    vi.spyOn(service, "getUnpaidOrders").mockResolvedValue({ orders: [], total: new Prisma.Decimal(0) });
    const seatedAt = new Date("2026-11-19T10:00:00Z");
    vi.spyOn(service, "getOpenTableSessions").mockResolvedValue([
      { id: "s-1", table: { name: "Table 5", area: "Family Hall" }, seatedAt, orderCount: 0, owed: "0.00", canClose: true },
    ]);
    const end = vi.spyOn(service, "endBusinessDay");
    const { res, response } = fakeResponse();

    await controller.end(request({}), response);

    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({
      code: "OPEN_TABLE_SESSIONS",
      error: "Cannot end business day: 1 table(s) are still seated",
      openTableSessions: [{ id: "s-1", table: { name: "Table 5" } }],
    });
    expect(end).not.toHaveBeenCalled();
  });

  it("ends anyway with force: true", async () => {
    vi.spyOn(service, "getActiveBusinessDay").mockResolvedValue({ id: "day-1" } as Awaited<ReturnType<typeof service.getActiveBusinessDay>>);
    const unpaid = vi.spyOn(service, "getUnpaidOrders");
    // Table sync R6: a forced end goes through endBusinessDayForced, which closes the tables that owe nothing.
    const forced = vi
      .spyOn(service, "endBusinessDayForced")
      .mockResolvedValue({ id: "day-1", isActive: false } as Awaited<ReturnType<typeof service.endBusinessDayForced>>);
    const { res, response } = fakeResponse();

    await controller.end(request({ force: true }), response);

    expect(res.statusCode).toBe(200);
    expect(unpaid).not.toHaveBeenCalled();
    expect(forced).toHaveBeenCalledWith("day-1", expect.any(String));
  });
});

describe.skipIf(!isLocalDb)("getUnpaidOrders (local DB, rolled back)", () => {
  it("returns accepted, not-cancelled orders that aren't paid — delivered ones included", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      await world.order({ status: "COMPLETED" }); // unpaid, delivered: 600
      await world.order({ status: "PENDING", discount: 100 }); // unpaid, open: 500
      await world.order({ status: "COMPLETED", paymentStatus: "VERIFIED" }); // paid: a sale
      await world.order({ status: "CANCELLED" });
      await world.order({ status: "AWAITING_RECEPTION" });
      return service.getUnpaidOrders(world.day.id);
    });
    expect(result.orders.map((order) => [order.orderNumber, order.totalAmount.toFixed(2)])).toEqual([
      [1, "600.00"],
      [2, "500.00"],
    ]);
    expect(result.total.toFixed(2)).toBe("1100.00");
  });
});
