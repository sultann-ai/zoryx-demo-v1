import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../../generated/prisma/client";

// The guest-order orchestration with Prisma and createOrder mocked: what it passes to createOrder
// (so pricing stays in createOrder), replay/idempotency, the ordering-open and area checks, the
// Postgres-counted limits (via the guard it hands to createOrder) and the code-collision retry.
const state = vi.hoisted(() => ({
  existingOrder: null as unknown,
  area: null as unknown,
  settings: null as unknown,
  activeDay: { id: "day-1" } as unknown,
  createOrder: vi.fn(),
}));

vi.mock("../../config/prisma", () => ({
  prisma: {
    order: { findUnique: async () => state.existingOrder },
    deliveryArea: { findUnique: async () => state.area },
    siteSettings: { findUnique: async () => state.settings, upsert: async () => state.settings },
    businessDay: { findFirst: async () => state.activeDay },
  },
}));

vi.mock("../order/order.service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../order/order.service")>();
  return { ...actual, createOrder: state.createOrder };
});

// Store settings as the database returns them (only the fields the service reads).
const settings = (over: Record<string, unknown> = {}) => ({
  onlineOrderingEnabled: true,
  deliveryEnabled: true,
  pickupEnabled: true,
  pickupMinOrderAmount: new Prisma.Decimal(0),
  addressEn: "Main Bazaar",
  addressUr: "مین بازار",
  mapUrl: "https://maps.example/shop",
  pickupNoteEn: null,
  pickupNoteUr: null,
  ...over,
});

const REQUEST_ID = "6f1c1a52-6a64-4c5e-9d2b-3f0a8b7c9d10";
const PHONE = "03001234567";

function guestInput(over: { paymentMethod?: "CASH" | "ONLINE"; phone?: string } = {}) {
  return {
    clientRequestId: REQUEST_ID,
    orderType: "DELIVERY" as const,
    items: [{ menuItemId: "item-1", quantity: 2 }],
    deals: [{ dealId: "deal-1", quantity: 1 }],
    customer: {
      name: "Ali Khan",
      phone: over.phone ?? PHONE,
      deliveryAreaId: "area-1",
      house: "12",
      street: "Street 5",
      landmark: "Near the mosque" as string | undefined,
    },
    notes: "Ring the bell" as string | undefined,
    paymentMethod: over.paymentMethod ?? ("CASH" as const),
  };
}

const area = (over: Record<string, unknown> = {}) => ({
  id: "area-1",
  nameEn: "DHA Phase 2",
  isActive: true,
  deliveryFee: new Prisma.Decimal("150"),
  minOrderAmount: new Prisma.Decimal("800"),
  ...over,
});

const createdOrder = (over: Record<string, unknown> = {}) => ({
  publicId: "pid-1234567890123456789012",
  publicCode: "K7P2M",
  orderNumber: 7,
  totalAmount: new Prisma.Decimal("1550"),
  deliveryFee: new Prisma.Decimal("150"),
  paymentMethod: "CASH",
  ...over,
});

const replayRow = (over: Record<string, unknown> = {}) => ({
  publicId: "pid-1234567890123456789012",
  publicCode: "K7P2M",
  orderNumber: 7,
  totalAmount: new Prisma.Decimal("1550"),
  deliveryFee: new Prisma.Decimal("150"),
  paymentMethod: "CASH",
  status: "AWAITING_RECEPTION",
  type: "DELIVERY",
  riderId: null,
  customerPhone: PHONE,
  items: [{ status: "PENDING" }],
  ...over,
});

let service: typeof import("./guestOrder.service");

beforeEach(async () => {
  process.env.DATABASE_URL ??= "postgresql://test";
  process.env.JWT_SECRET ??= "test-secret";
  process.env.PORT ??= "0";
  state.existingOrder = null;
  state.area = area();
  state.settings = settings();
  state.activeDay = { id: "day-1" };
  state.createOrder.mockReset();
  state.createOrder.mockResolvedValue(createdOrder());
  service = await import("./guestOrder.service");
});

describe("replay (idempotent on clientRequestId)", () => {
  it("returns the original answer without creating anything", async () => {
    state.existingOrder = replayRow();
    const { result, isNew } = await service.createGuestOrder(guestInput(), "203.0.113.7");
    expect(isNew).toBe(false);
    expect(result).toEqual({
      publicId: "pid-1234567890123456789012",
      publicCode: "K7P2M",
      orderNumber: 7,
      total: "1550",
      deliveryFee: "150",
      paymentMethod: "CASH",
      status: "RECEIVED",
      orderType: "DELIVERY",
    });
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it("reports the CURRENT status on a replay, not a stale one", async () => {
    state.existingOrder = replayRow({ status: "CONFIRMED", items: [{ status: "PREPARING" }] });
    const { result } = await service.createGuestOrder(guestInput(), "203.0.113.7");
    expect(result.status).toBe("PREPARING");
  });

  it("replays even after ordering has closed (the customer's retry must not turn into an error)", async () => {
    state.existingOrder = replayRow();
    state.settings = settings({ onlineOrderingEnabled: false });
    await expect(service.createGuestOrder(guestInput(), "203.0.113.7")).resolves.toMatchObject({ isNew: false });
  });

  it("refuses to hand a status link to a different phone", async () => {
    state.existingOrder = replayRow({ customerPhone: "03111111111" });
    await expect(service.createGuestOrder(guestInput(), "203.0.113.7")).rejects.toBeInstanceOf(service.RequestIdReusedError);
  });

  it("refuses a clientRequestId that belongs to a non-guest order", async () => {
    state.existingOrder = replayRow({ publicId: null, publicCode: null });
    await expect(service.createGuestOrder(guestInput(), "203.0.113.7")).rejects.toBeInstanceOf(service.RequestIdReusedError);
  });

  it("resolves a true race (unique violation on clientRequestId) to the replay answer", async () => {
    state.createOrder.mockImplementation(async () => {
      state.existingOrder = replayRow();
      throw new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["clientRequestId"] } });
    });
    const { isNew, result } = await service.createGuestOrder(guestInput(), "203.0.113.7");
    expect(isNew).toBe(false);
    expect(result.publicCode).toBe("K7P2M");
  });
});

describe("preconditions", () => {
  it("refuses when online ordering is switched off", async () => {
    state.settings = settings({ onlineOrderingEnabled: false });
    await expect(service.createGuestOrder(guestInput(), "ip")).rejects.toBeInstanceOf(service.OrderingClosedError);
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it("refuses when no business day is active", async () => {
    state.activeDay = null;
    await expect(service.createGuestOrder(guestInput(), "ip")).rejects.toBeInstanceOf(service.OrderingClosedError);
  });

  it("refuses an unknown or inactive delivery area", async () => {
    state.area = null;
    await expect(service.createGuestOrder(guestInput(), "ip")).rejects.toBeInstanceOf(service.BadAreaError);
    state.area = area({ isActive: false });
    await expect(service.createGuestOrder(guestInput(), "ip")).rejects.toBeInstanceOf(service.BadAreaError);
    expect(state.createOrder).not.toHaveBeenCalled();
  });
});

describe("what it asks createOrder to do (pricing stays in createOrder)", () => {
  it("creates an ONLINE DELIVERY order waiting at reception, with the area fee and policy checks", async () => {
    const { result, isNew } = await service.createGuestOrder(guestInput(), "203.0.113.7");
    expect(isNew).toBe(true);
    expect(result).toEqual({
      publicId: "pid-1234567890123456789012",
      publicCode: "K7P2M",
      orderNumber: 7,
      total: "1550",
      deliveryFee: "150",
      paymentMethod: "CASH",
      status: "RECEIVED",
      orderType: "DELIVERY",
    });

    expect(state.createOrder).toHaveBeenCalledTimes(1);
    const call = state.createOrder.mock.calls[0]![0];
    expect(call).toMatchObject({
      source: "ONLINE",
      type: "DELIVERY",
      status: "AWAITING_RECEPTION",
      paymentMethod: "CASH",
      customerName: "Ali Khan",
      customerPhone: PHONE,
      deliveryAreaId: "area-1",
      deliveryAddress: "House 12, Street 5, DHA Phase 2\nLandmark: Near the mosque",
      notes: "Ring the bell",
      clientRequestId: REQUEST_ID,
      onlineOnly: true,
      items: [{ menuItemId: "item-1", quantity: 2 }],
      deals: [{ dealId: "deal-1", quantity: 1 }],
    });
    expect(call.deliveryFee.toString()).toBe("150");
    expect(call.minSubtotal.toString()).toBe("800");
    expect(call.maxTotal.toString()).toBe("200000");
    expect(typeof call.guard).toBe("function");
    // No account, and no client-supplied price anywhere.
    expect(call).not.toHaveProperty("customerId");
    expect(call).not.toHaveProperty("customerAddressId");
    expect(call).not.toHaveProperty("discount");
    expect(call).not.toHaveProperty("paymentScreenshotUrl");
    // CASH leaves paymentStatus at its default (PENDING).
    expect(call).not.toHaveProperty("paymentStatus");
  });

  it("gives every order its own unguessable link and a 5-character code", async () => {
    await service.createGuestOrder(guestInput(), "ip");
    const call = state.createOrder.mock.calls[0]![0];
    expect(call.publicId).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(call.publicCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
  });

  it("marks an ONLINE-paid order AWAITING_VERIFICATION", async () => {
    await service.createGuestOrder(guestInput({ paymentMethod: "ONLINE" }), "ip");
    expect(state.createOrder.mock.calls[0]![0]).toMatchObject({ paymentMethod: "ONLINE", paymentStatus: "AWAITING_VERIFICATION" });
  });

  it("omits the minimum when the area has none, and omits the landmark line when not given", async () => {
    state.area = area({ minOrderAmount: new Prisma.Decimal(0) });
    await service.createGuestOrder({ ...guestInput(), customer: { ...guestInput().customer, landmark: undefined }, notes: undefined }, "ip");
    const call = state.createOrder.mock.calls[0]![0];
    expect(call).not.toHaveProperty("minSubtotal");
    expect(call.deliveryAddress).toBe("House 12, Street 5, DHA Phase 2");
    expect(call).not.toHaveProperty("notes");
  });

  it("stores only a keyed hash of the client IP", async () => {
    await service.createGuestOrder(guestInput(), "203.0.113.7");
    const { clientIpHash } = state.createOrder.mock.calls[0]![0];
    expect(clientIpHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(state.createOrder.mock.calls[0]![0])).not.toContain("203.0.113.7");
  });

  it("retries with a new code when the 5-character code collides, but not forever", async () => {
    const collision = () =>
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x", meta: { target: ["publicCode"] } });
    state.createOrder.mockRejectedValueOnce(collision()).mockRejectedValueOnce(collision());
    const { isNew } = await service.createGuestOrder(guestInput(), "ip");
    expect(isNew).toBe(true);
    expect(state.createOrder).toHaveBeenCalledTimes(3);

    state.createOrder.mockReset();
    state.createOrder.mockRejectedValue(collision());
    await expect(service.createGuestOrder(guestInput(), "ip")).rejects.toThrow("unique order code");
    expect(state.createOrder).toHaveBeenCalledTimes(6);
  });

  it("does not swallow other errors", async () => {
    state.createOrder.mockRejectedValueOnce(new Error("database down"));
    await expect(service.createGuestOrder(guestInput(), "ip")).rejects.toThrow("database down");
  });
});

describe("the Postgres-counted limits (the guard handed to createOrder)", () => {
  async function guardFor() {
    await service.createGuestOrder(guestInput(), "203.0.113.7");
    return state.createOrder.mock.calls[0]![0].guard as (tx: unknown) => Promise<void>;
  }

  function fakeTx(counts: { ipTen: number; ipDay: number; awaiting: number; phoneDay: number; notCollected?: number }) {
    const seen = { ip: [] as unknown[], order: [] as unknown[] };
    const tx = {
      orderClientIp: {
        count: async (args: { where: { createdAt: { gte: Date } } }) => {
          seen.ip.push(args);
          // The ten-minute window starts later than the day window.
          return Date.now() - args.where.createdAt.gte.getTime() < 11 * 60 * 1000 ? counts.ipTen : counts.ipDay;
        },
      },
      order: {
        count: async (args: { where: { status?: string; notCollectedAt?: unknown } }) => {
          seen.order.push(args);
          if (args.where.notCollectedAt !== undefined) return counts.notCollected ?? 0;
          return args.where.status === "AWAITING_RECEPTION" ? counts.awaiting : counts.phoneDay;
        },
      },
    };
    return { tx, seen };
  }

  it("lets an order through while every count is under its limit", async () => {
    const guard = await guardFor();
    const { tx } = fakeTx({ ipTen: 4, ipDay: 29, awaiting: 2, phoneDay: 9, notCollected: 2 });
    await expect(guard(tx)).resolves.toBeUndefined();
  });

  it.each([
    ["5 orders from the same IP in 10 minutes", { ipTen: 5, ipDay: 5, awaiting: 0, phoneDay: 0 }],
    ["30 orders from the same IP in a day", { ipTen: 0, ipDay: 30, awaiting: 0, phoneDay: 0 }],
    ["3 orders from this phone still awaiting", { ipTen: 0, ipDay: 0, awaiting: 3, phoneDay: 0 }],
    ["10 orders from this phone in 24 hours", { ipTen: 0, ipDay: 0, awaiting: 0, phoneDay: 10 }],
    ["3 \"Not collected\" pickup no-shows from this phone in 90 days", { ipTen: 0, ipDay: 0, awaiting: 0, phoneDay: 0, notCollected: 3 }],
  ])("refuses at %s", async (_label, counts) => {
    const guard = await guardFor();
    const { tx } = fakeTx(counts);
    await expect(guard(tx)).rejects.toBeInstanceOf((await import("../order/order.service")).OrderGuardRejectedError);
  });

  it("counts by the hashed IP and by this phone", async () => {
    const guard = await guardFor();
    const { tx, seen } = fakeTx({ ipTen: 0, ipDay: 0, awaiting: 0, phoneDay: 0 });
    await guard(tx);
    const { clientIpHash } = state.createOrder.mock.calls[0]![0];
    expect(seen.ip.every((args) => (args as { where: { ipHash: string } }).where.ipHash === clientIpHash)).toBe(true);
    expect(seen.order.every((args) => (args as { where: { customerPhone: string } }).where.customerPhone === PHONE)).toBe(true);
  });
});

describe("pickup orders (a TAKEAWAY order: no area, no address, no fee)", () => {
  const pickupInput = (over: Record<string, unknown> = {}) => ({
    clientRequestId: REQUEST_ID,
    orderType: "PICKUP" as const,
    items: [{ menuItemId: "item-1", quantity: 2 }],
    deals: [],
    customer: { name: "Ali Khan", phone: PHONE },
    notes: undefined as string | undefined,
    paymentMethod: "CASH" as const,
    ...over,
  });

  beforeEach(() => {
    state.createOrder.mockResolvedValue(createdOrder({ deliveryFee: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal("1400") }));
  });

  it("asks createOrder for an ONLINE TAKEAWAY order with no delivery fee, area or address", async () => {
    const { result } = await service.createGuestOrder(pickupInput(), "ip");
    expect(result).toMatchObject({ deliveryFee: "0", total: "1400", orderType: "PICKUP", status: "RECEIVED" });
    const call = state.createOrder.mock.calls[0]![0];
    expect(call).toMatchObject({ source: "ONLINE", type: "TAKEAWAY", status: "AWAITING_RECEPTION", customerName: "Ali Khan", customerPhone: PHONE, onlineOnly: true });
    expect(call).not.toHaveProperty("deliveryFee");
    expect(call).not.toHaveProperty("deliveryAreaId");
    expect(call).not.toHaveProperty("deliveryAddress");
    // Every other rule still applies: limits guard, max total, idempotency key, link and code.
    expect(typeof call.guard).toBe("function");
    expect(call.maxTotal.toString()).toBe("200000");
    expect(call.clientRequestId).toBe(REQUEST_ID);
    expect(call.publicId).toMatch(/^[A-Za-z0-9_-]{22,}$/);
  });

  it("never looks up a delivery area (a stale or bad area id cannot fail a pickup)", async () => {
    state.area = null;
    await expect(service.createGuestOrder(pickupInput(), "ip")).resolves.toMatchObject({ isNew: true });
  });

  it("uses the PICKUP minimum, not an area minimum", async () => {
    state.settings = settings({ pickupMinOrderAmount: new Prisma.Decimal("500") });
    await service.createGuestOrder(pickupInput(), "ip");
    expect(state.createOrder.mock.calls[0]![0].minSubtotal.toString()).toBe("500");
    state.createOrder.mockClear();
    state.settings = settings({ pickupMinOrderAmount: new Prisma.Decimal(0) });
    await service.createGuestOrder(pickupInput(), "ip");
    expect(state.createOrder.mock.calls[0]![0]).not.toHaveProperty("minSubtotal");
  });

  it("marks an ONLINE-paid pickup AWAITING_VERIFICATION, like delivery", async () => {
    await service.createGuestOrder(pickupInput({ paymentMethod: "ONLINE" }), "ip");
    expect(state.createOrder.mock.calls[0]![0]).toMatchObject({ paymentMethod: "ONLINE", paymentStatus: "AWAITING_VERIFICATION" });
  });

  it("replays a pickup order with its pickup type", async () => {
    state.existingOrder = replayRow({ type: "TAKEAWAY", deliveryFee: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal("1400") });
    const { result, isNew } = await service.createGuestOrder(pickupInput(), "ip");
    expect(isNew).toBe(false);
    expect(result).toMatchObject({ orderType: "PICKUP", deliveryFee: "0", total: "1400" });
  });
});

describe("ways to order the shop has switched off", () => {
  it("refuses pickup when pickup is off, and delivery when delivery is off", async () => {
    state.settings = settings({ pickupEnabled: false });
    await expect(
      service.createGuestOrder({ ...guestInput(), orderType: "PICKUP" as const, customer: { name: "Ali Khan", phone: PHONE } }, "ip"),
    ).rejects.toBeInstanceOf(service.PickupUnavailableError);
    state.settings = settings({ deliveryEnabled: false });
    await expect(service.createGuestOrder(guestInput(), "ip")).rejects.toBeInstanceOf(service.DeliveryUnavailableError);
    expect(state.createOrder).not.toHaveBeenCalled();
  });

  it("still lets the other way through", async () => {
    state.settings = settings({ deliveryEnabled: false });
    await expect(
      service.createGuestOrder({ ...guestInput(), orderType: "PICKUP" as const, customer: { name: "Ali Khan", phone: PHONE } }, "ip"),
    ).resolves.toMatchObject({ isNew: true });
  });
});
