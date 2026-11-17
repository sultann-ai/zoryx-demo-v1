import { describe, expect, it } from "vitest";
import { OrderItemStatus, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "../../../generated/prisma/client";
import { SourcePublicOrder, toPublicOrderStatus } from "./publicOrderMapper";

// Every row is seeded with SECRET-* values in the places the customer's status page must never
// show. If the mapper ever spreads a row, or a new column starts leaking, the JSON assertions fail.
const SECRET = "SECRET";

function order(over: Record<string, unknown> = {}): SourcePublicOrder {
  return {
    publicCode: "K7P2M",
    type: OrderType.DELIVERY,
    status: OrderStatus.CONFIRMED,
    riderId: null,
    paymentMethod: PaymentMethod.CASH,
    paymentStatus: PaymentStatus.PENDING,
    paymentProofMediaId: null,
    cancelledReason: null,
    discount: "0",
    deliveryFee: "150",
    totalAmount: "1550",
    createdAt: new Date("2026-11-10T10:00:00Z"),
    items: [
      {
        status: OrderItemStatus.PENDING,
        quantity: 2,
        subtotal: "700",
        variantLabel: "Large",
        addOns: [{ addOnId: `${SECRET}-ADDON-ID`, name: "Extra cheese", price: "50" }],
        dealOrderLineId: null,
        menuItem: { name: "Zinger", nameUr: "زنگر", id: `${SECRET}-MENU-ID`, kitchenId: `${SECRET}-KITCHEN` },
        id: `${SECRET}-ITEM-ID`,
        notes: `${SECRET}-LINE-NOTE`,
        kitchenId: `${SECRET}-KITCHEN`,
      },
      {
        status: OrderItemStatus.PENDING,
        quantity: 2,
        subtotal: "0",
        variantLabel: null,
        addOns: null,
        dealOrderLineId: "line-1",
        menuItem: { name: "Fries", nameUr: null },
      },
    ],
    dealLines: [{ id: "line-1", dealName: "Family Deal", quantity: 1, subtotal: "700", deal: { nameUr: "فیملی ڈیل" } }],
    // Internal / private columns a careless mapper might spread:
    id: `${SECRET}-ORDER-ID`,
    customerName: `${SECRET}-NAME`,
    customerPhone: `${SECRET}-0300-PHONE`,
    deliveryAddress: `${SECRET}-ADDRESS`,
    deliveryAreaId: `${SECRET}-AREA`,
    notes: `${SECRET}-ORDER-NOTES`,
    placedByStaffId: `${SECRET}-STAFF`,
    acceptedById: `${SECRET}-ACCEPTED-BY`,
    waiterId: `${SECRET}-WAITER`,
    publicId: `${SECRET}-PUBLIC-ID`,
    clientRequestId: `${SECRET}-REQUEST-ID`,
    paymentVerifiedById: `${SECRET}-VERIFIER`,
    orderNumber: 77,
    ...over,
  } as unknown as SourcePublicOrder;
}

describe("toPublicOrderStatus — privacy", () => {
  it("never exposes phone, address, notes, staff, ids or any internal column", () => {
    const json = JSON.stringify(
      toPublicOrderStatus(order({ riderId: `${SECRET}-RIDER`, cancelledReason: null })),
    );
    expect(json).not.toContain(SECRET);
    for (const key of [
      "customerPhone",
      "customerName",
      "deliveryAddress",
      "notes",
      "placedByStaffId",
      "acceptedById",
      "waiterId",
      "riderId",
      "publicId",
      "clientRequestId",
      "kitchenId",
      "menuItemId",
      "orderNumber",
      "\"id\"",
    ]) {
      expect(json, key).not.toContain(key);
    }
  });

  it("returns exactly the agreed top-level fields", () => {
    expect(Object.keys(toPublicOrderStatus(order())).sort()).toEqual(
      ["cancelReason", "createdAt", "deliveryFee", "discount", "lines", "orderType", "payment", "publicCode", "status", "subtotal", "total"].sort(),
    );
  });

  it("does not leak a cancellation reason unless the order is actually cancelled", () => {
    expect(toPublicOrderStatus(order({ cancelledReason: "stale reason" })).cancelReason).toBeNull();
  });
});

describe("toPublicOrderStatus — content", () => {
  it("lists items with name, size, add-ons, quantity and line total (no add-on ids)", () => {
    const status = toPublicOrderStatus(order());
    expect(status.lines[0]).toEqual({
      kind: "item",
      name: "Zinger",
      nameUr: "زنگر",
      size: "Large",
      addOns: [{ name: "Extra cheese", price: "50" }],
      quantity: 2,
      lineTotal: "700",
    });
  });

  it("lists a deal with its contents, and does not list the deal's exploded items as separate lines", () => {
    const status = toPublicOrderStatus(order());
    const dealLine = status.lines.find((line) => line.kind === "deal");
    expect(dealLine).toEqual({
      kind: "deal",
      name: "Family Deal",
      nameUr: "فیملی ڈیل",
      quantity: 1,
      lineTotal: "700",
      contents: [{ name: "Fries", nameUr: null, size: null, addOns: [], quantity: 2 }],
    });
    expect(status.lines).toHaveLength(2);
  });

  it("returns subtotal, fee, discount and total as strings, with the subtotal summed exactly", () => {
    const status = toPublicOrderStatus(order({ discount: "50", totalAmount: "1500" }));
    expect(status.subtotal).toBe("1400");
    expect(status.deliveryFee).toBe("150");
    expect(status.discount).toBe("50");
    expect(status.total).toBe("1500");
    expect(status.createdAt).toEqual(new Date("2026-11-10T10:00:00Z"));
  });

  it("sums fractional money without drift", () => {
    const status = toPublicOrderStatus(
      order({
        items: [
          { status: OrderItemStatus.PENDING, quantity: 1, subtotal: "0.10", variantLabel: null, addOns: null, dealOrderLineId: null, menuItem: { name: "a", nameUr: null } },
          { status: OrderItemStatus.PENDING, quantity: 1, subtotal: "0.20", variantLabel: null, addOns: null, dealOrderLineId: null, menuItem: { name: "b", nameUr: null } },
        ],
        dealLines: [],
      }),
    );
    expect(status.subtotal).toBe("0.3");
  });

  it("derives the status and payment state", () => {
    expect(toPublicOrderStatus(order({ status: OrderStatus.AWAITING_RECEPTION })).status).toBe("RECEIVED");
    expect(toPublicOrderStatus(order({ status: OrderStatus.COMPLETED })).status).toBe("DELIVERED");
    expect(toPublicOrderStatus(order()).payment).toEqual({ method: "CASH", state: "NOT_REQUIRED" });
    expect(
      toPublicOrderStatus(order({ paymentMethod: PaymentMethod.ONLINE, paymentStatus: PaymentStatus.AWAITING_VERIFICATION, paymentProofMediaId: "m" })).payment,
    ).toEqual({ method: "ONLINE", state: "PROOF_RECEIVED" });
  });

  it("shows the staff reason for a CANCELLED order", () => {
    const status = toPublicOrderStatus(order({ status: OrderStatus.CANCELLED, cancelledReason: "We are out of zinger today" }));
    expect(status.status).toBe("CANCELLED");
    expect(status.cancelReason).toBe("We are out of zinger today");
  });

  it("tolerates malformed add-on JSON", () => {
    const status = toPublicOrderStatus(
      order({
        items: [
          { status: OrderItemStatus.PENDING, quantity: 1, subtotal: "10", variantLabel: null, addOns: "garbage", dealOrderLineId: null, menuItem: { name: "a", nameUr: null } },
          { status: OrderItemStatus.PENDING, quantity: 1, subtotal: "10", variantLabel: null, addOns: [null, 5, { price: "1" }, { name: "ok", price: 2 }], dealOrderLineId: null, menuItem: { name: "b", nameUr: null } },
        ],
        dealLines: [],
      }),
    );
    expect(status.lines.map((line) => (line.kind === "item" ? line.addOns : null))).toEqual([[], [{ name: "ok", price: "2" }]]);
  });
});

describe("pickup orders on the status page", () => {
  const shop = { addressEn: "Main Bazaar", addressUr: "مین بازار", mapUrl: "https://maps.example/shop", noteEn: "Ready in about 20 minutes", noteUr: null };
  const pickupOrder = (over: Record<string, unknown> = {}) => order({ type: OrderType.TAKEAWAY, deliveryFee: "0", totalAmount: "1400", ...over });

  it("says PICKUP, and shows where to collect (shop content only)", () => {
    const out = toPublicOrderStatus(pickupOrder(), shop);
    expect(out.orderType).toBe("PICKUP");
    expect(out).toHaveProperty("pickup", shop);
    expect(out.deliveryFee).toBe("0");
  });

  it("READY means ready to collect: a rider can never make it ON_THE_WAY, and COMPLETED is the final step", () => {
    const ready = pickupOrder({ riderId: "rider-1", items: order().items.map((i) => ({ ...i, status: OrderItemStatus.READY })) });
    expect(toPublicOrderStatus(ready, shop).status).toBe("READY");
    expect(toPublicOrderStatus(pickupOrder({ status: OrderStatus.COMPLETED }), shop).status).toBe("DELIVERED");
  });

  it("a delivery order says DELIVERY and has no pickup block", () => {
    const out = toPublicOrderStatus(order(), shop);
    expect(out.orderType).toBe("DELIVERY");
    expect(out).not.toHaveProperty("pickup");
  });

  it("still leaks nothing private (phone, address, notes, staff, ids) for a pickup", () => {
    const json = JSON.stringify(toPublicOrderStatus(pickupOrder(), shop));
    for (const key of ["SECRET-0300-PHONE", "SECRET-ADDRESS", "SECRET-NAME", "SECRET-ORDER-NOTES", "SECRET-STAFF", "SECRET-PUBLIC-ID"]) {
      expect(json, key).not.toContain(key);
    }
  });

  it("shows the cancellation reason for a not-collected order", () => {
    const out = toPublicOrderStatus(pickupOrder({ status: OrderStatus.CANCELLED, cancelledReason: "Not collected" }), shop);
    expect(out.status).toBe("CANCELLED");
    expect(out.cancelReason).toBe("Not collected");
  });
});
