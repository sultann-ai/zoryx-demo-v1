import { describe, expect, it, vi } from "vitest";
import { Prisma, StaffRole } from "../../../generated/prisma/client";
import { isLocalDb, withRollback } from "../../common/testDb";
import { getAnalytics } from "../reports/analytics.service";
import {
  DiscountActor,
  DiscountAboveCapError,
  DiscountReasonRequiredError,
  DiscountReasonTooLongError,
  checkDiscountChange,
  formatPercent,
} from "./discountPolicy";
import * as orderService from "./order.service";
import { listOrderEvents } from "./orderEvents";
import { seedOrderWorld } from "./orderTestSeed";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO } = await import("../../common/testDb");
  return { getIO: () => sharedFakeIO.io };
});

const D = (value: number | string) => new Prisma.Decimal(value);
const posAdmin = (reason?: string): DiscountActor => ({ actorId: "s1", role: StaffRole.POS_ADMIN, reason: reason ?? null });
const check = (next: number, actor: DiscountActor, current = 0) =>
  checkDiscountChange({ next: D(next), current: D(current), subtotal: D(600), actor, capPercent: D(20) });

describe("checkDiscountChange", () => {
  it("lets the unchanged discount through without a reason or the cap", () => {
    expect(check(300, posAdmin(), 300)).toEqual({ changed: false });
  });

  it("needs a reason for any discount above 0, at most 200 characters", () => {
    expect(() => check(50, posAdmin())).toThrow(DiscountReasonRequiredError);
    expect(() => check(50, posAdmin("   "))).toThrow(DiscountReasonRequiredError);
    expect(() => check(50, posAdmin("x".repeat(201)))).toThrow(DiscountReasonTooLongError);
    expect(check(50, posAdmin("  regular customer "))).toEqual({ changed: true, reason: "regular customer" });
  });

  it("caps a POS Admin at the percent of the items subtotal, inclusive", () => {
    expect(check(120, posAdmin("ok"))).toEqual({ changed: true, reason: "ok" });
    expect(() => check(120.01, posAdmin("too much"))).toThrow(DiscountAboveCapError);
    expect(() => check(121, posAdmin("too much"))).toThrow("Discount above 20% needs a Super Admin");
  });

  it("does not cap a Super Admin", () => {
    expect(check(500, { actorId: "s1", role: StaffRole.SUPER_ADMIN, reason: "owner's friend" }).changed).toBe(true);
  });

  it("allows setting a discount back to 0 with no reason", () => {
    expect(check(0, posAdmin(), 100)).toEqual({ changed: true, reason: null });
  });

  it("prints the cap without trailing zeros", () => {
    expect(formatPercent(D("20.00"))).toBe("20");
    expect(formatPercent(D("12.50"))).toBe("12.5");
  });
});

describe.skipIf(!isLocalDb)("discounts on real orders (local DB, rolled back)", () => {
  it("Confirm Payment: a POS Admin over the cap is refused; within it, who/when/why is stored and logged", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const order = await world.order();
      const refused = await orderService
        .updatePaymentStatus(order.id, "VERIFIED", { discount: D(150), discountReason: "x", actorId: world.posAdmin.id, actorRole: StaffRole.POS_ADMIN })
        .catch((error) => error);
      const updated = await orderService.updatePaymentStatus(order.id, "VERIFIED", {
        discount: D(100),
        discountReason: "Birthday",
        actorId: world.posAdmin.id,
        actorRole: StaffRole.POS_ADMIN,
      });
      return { refused, updated, events: await listOrderEvents(order.id), world };
    });
    expect(result.refused).toBeInstanceOf(DiscountAboveCapError);
    expect(result.updated).toMatchObject({ discountById: result.world.posAdmin.id, discountReason: "Birthday" });
    expect(result.updated.discountAt).toBeInstanceOf(Date);
    expect(result.updated.totalAmount.toFixed(2)).toBe("500.00");
    expect(result.events[0]).toMatchObject({ type: "DISCOUNT_SET", reason: "Birthday", before: { discount: "0.00" }, after: { discount: "100.00" } });
  });

  it("reads the cap from site settings and applies it at reception (accept) too", async () => {
    const errors = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      await tx.siteSettings.upsert({
        where: { id: 1 },
        create: {
          id: 1, shopNameEn: "x", shopNameUr: "x", taglineEn: "x", taglineUr: "x", phone: "x", whatsappNumber: "x",
          addressEn: "x", addressUr: "x", mapUrl: "x", openingHoursEn: "x", openingHoursUr: "x", maxDiscountPercentPosAdmin: 10,
        },
        update: { maxDiscountPercentPosAdmin: 10 },
      });
      const order = await world.order({ status: "AWAITING_RECEPTION" });
      const overCap = await orderService.acceptOrder(order.id, world.posAdmin.id, { discount: D(61), discountReason: "x" }, StaffRole.POS_ADMIN).catch((error) => error);
      const noReason = await orderService.acceptOrder(order.id, world.posAdmin.id, { discount: D(60) }, StaffRole.POS_ADMIN).catch((error) => error);
      const bySuperAdmin = await orderService.acceptOrder(order.id, world.superAdmin.id, { discount: D(300), discountReason: "comp" }, StaffRole.SUPER_ADMIN);
      return { overCap, noReason, bySuperAdmin };
    });
    expect(errors.overCap.message).toBe("Discount above 10% needs a Super Admin");
    expect(errors.noReason).toBeInstanceOf(DiscountReasonRequiredError);
    expect(errors.bySuperAdmin.discountReason).toBe("comp");
  });

  it("the dashboard's discounts-given breaks the period's discounts down by staff", async () => {
    const discounts = await withRollback(async (tx) => {
      const world = await seedOrderWorld(tx);
      const paid = { paymentStatus: "VERIFIED" as const };
      await world.order({ ...paid, discount: 50, discountById: world.posAdmin.id });
      await world.order({ ...paid, discount: 30, discountById: world.posAdmin.id });
      await world.order({ ...paid, discount: 100, discountById: world.superAdmin.id });
      await world.order({ ...paid, discount: 20 }); // set before attribution existed
      await world.order({ discount: 999, discountById: world.posAdmin.id }); // unpaid: not a sale
      const analytics = await getAnalytics({ period: "custom", custom: { from: "2001-01-01", to: "2001-01-01" }, includeFinancials: true }, tx);
      return analytics.discounts;
    });
    expect(discounts).toEqual({
      total: "200.00",
      count: 4,
      byStaff: [
        { staffId: expect.any(String), name: "Sana Super", count: 1, amount: "100.00" },
        { staffId: expect.any(String), name: "Pervez Pos", count: 2, amount: "80.00" },
        { staffId: null, name: "Not recorded", count: 1, amount: "20.00" },
      ],
    });
  });
});
