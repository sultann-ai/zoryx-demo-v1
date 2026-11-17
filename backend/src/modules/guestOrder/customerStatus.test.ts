import { describe, expect, it } from "vitest";
import { OrderItemStatus as I, OrderStatus as S, OrderType, PaymentMethod, PaymentStatus } from "../../../generated/prisma/client";
import { deriveCustomerStatus, derivePaymentState } from "./customerStatus";

const status = (orderStatus: S, itemStatuses: I[], riderId: string | null = null) =>
  deriveCustomerStatus({ status: orderStatus, riderId, itemStatuses });

describe("deriveCustomerStatus", () => {
  it("AWAITING_RECEPTION is RECEIVED, whatever the items say", () => {
    expect(status(S.AWAITING_RECEPTION, [I.PENDING])).toBe("RECEIVED");
    expect(status(S.AWAITING_RECEPTION, [I.READY], "rider-1")).toBe("RECEIVED");
  });

  it("an accepted order with nothing started is CONFIRMED", () => {
    expect(status(S.CONFIRMED, [I.PENDING, I.PENDING])).toBe("CONFIRMED");
    expect(status(S.CONFIRMED, [])).toBe("CONFIRMED");
  });

  it("any item PREPARING makes it PREPARING", () => {
    expect(status(S.CONFIRMED, [I.PENDING, I.PREPARING])).toBe("PREPARING");
    expect(status(S.CONFIRMED, [I.READY, I.PREPARING])).toBe("PREPARING");
  });

  it("every item READY or SERVED is READY", () => {
    expect(status(S.CONFIRMED, [I.READY, I.READY])).toBe("READY");
    expect(status(S.CONFIRMED, [I.READY, I.SERVED])).toBe("READY");
    expect(status(S.CONFIRMED, [I.SERVED])).toBe("READY");
  });

  it("READY with a rider assigned is ON_THE_WAY, but a rider alone is not enough", () => {
    expect(status(S.CONFIRMED, [I.READY, I.READY], "rider-1")).toBe("ON_THE_WAY");
    expect(status(S.CONFIRMED, [I.PREPARING], "rider-1")).toBe("PREPARING");
    expect(status(S.CONFIRMED, [I.PENDING], "rider-1")).toBe("CONFIRMED");
  });

  it("some items ready but another not started is still CONFIRMED", () => {
    expect(status(S.CONFIRMED, [I.READY, I.PENDING])).toBe("CONFIRMED");
  });

  it("COMPLETED is DELIVERED and CANCELLED is CANCELLED, regardless of items", () => {
    expect(status(S.COMPLETED, [I.PENDING])).toBe("DELIVERED");
    expect(status(S.CANCELLED, [I.READY, I.READY], "rider-1")).toBe("CANCELLED");
  });

  it("a SCHEDULED order reads as RECEIVED", () => {
    expect(status(S.SCHEDULED, [I.PENDING])).toBe("RECEIVED");
  });

  it("works through the legacy accepted statuses too", () => {
    expect(status(S.PENDING, [I.READY])).toBe("READY");
    expect(status(S.IN_KITCHEN, [I.PREPARING])).toBe("PREPARING");
  });
});

describe("deriveCustomerStatus: pickup (TAKEAWAY) orders", () => {
  const pickup = (orderStatus: S, itemStatuses: I[], riderId: string | null = null) =>
    deriveCustomerStatus({ type: OrderType.TAKEAWAY, status: orderStatus, riderId, itemStatuses });

  it("is never ON_THE_WAY: READY means ready to collect, even with a rider recorded", () => {
    expect(pickup(S.CONFIRMED, [I.READY, I.READY], "rider-1")).toBe("READY");
    expect(pickup(S.CONFIRMED, [I.READY, I.SERVED])).toBe("READY");
  });

  it("uses the same steps otherwise: RECEIVED, CONFIRMED, PREPARING, READY, then COMPLETED (collected)", () => {
    expect(pickup(S.AWAITING_RECEPTION, [I.PENDING])).toBe("RECEIVED");
    expect(pickup(S.CONFIRMED, [I.PENDING])).toBe("CONFIRMED");
    expect(pickup(S.CONFIRMED, [I.PREPARING])).toBe("PREPARING");
    expect(pickup(S.COMPLETED, [I.SERVED])).toBe("DELIVERED");
    expect(pickup(S.CANCELLED, [I.PENDING])).toBe("CANCELLED");
  });

  it("delivery orders keep ON_THE_WAY", () => {
    expect(deriveCustomerStatus({ type: OrderType.DELIVERY, status: S.CONFIRMED, riderId: "r", itemStatuses: [I.READY] })).toBe("ON_THE_WAY");
  });
});

describe("derivePaymentState", () => {
  const state = (paymentMethod: PaymentMethod, paymentStatus: PaymentStatus, hasProof: boolean) =>
    derivePaymentState({ paymentMethod, paymentStatus, hasProof });

  it("cash orders never need payment up front", () => {
    for (const paymentStatus of Object.values(PaymentStatus)) {
      expect(state(PaymentMethod.CASH, paymentStatus, false)).toBe("NOT_REQUIRED");
    }
  });

  it("online: waiting until a proof arrives, then received", () => {
    expect(state(PaymentMethod.ONLINE, PaymentStatus.AWAITING_VERIFICATION, false)).toBe("WAITING_FOR_PAYMENT");
    expect(state(PaymentMethod.ONLINE, PaymentStatus.AWAITING_VERIFICATION, true)).toBe("PROOF_RECEIVED");
  });

  it("online: confirmed once verified, problem once rejected", () => {
    expect(state(PaymentMethod.ONLINE, PaymentStatus.VERIFIED, true)).toBe("PAYMENT_CONFIRMED");
    expect(state(PaymentMethod.ONLINE, PaymentStatus.REJECTED, true)).toBe("PAYMENT_PROBLEM");
    expect(state(PaymentMethod.ONLINE, PaymentStatus.REJECTED, false)).toBe("PAYMENT_PROBLEM");
  });
});
