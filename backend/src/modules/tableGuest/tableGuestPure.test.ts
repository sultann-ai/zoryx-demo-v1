import { describe, expect, it, vi } from "vitest";
import { OrderItemStatus, OrderStatus } from "../../../generated/prisma/client";
import { callCooldownSeconds, checkTableCallLimits, checkTableOrderLimits, orderCooldownSeconds, TABLE_QR_LIMITS } from "./tableQrLimits";
import { computeTableOrdering, deriveTableRoundStatus } from "./tableStatus";
import { isPlausibleGuestToken, generateGuestToken, generateJoinPin, generateQrKey, isPlausibleQrKey, hashGuestToken } from "./guestToken";
import { uniqueDisplayName } from "./tableGuest.service";
import { parseJoinBody, parseTableCallBody, parseTableOrderBody, TableGuestValidationError } from "./tableGuest.validators";

// The validators and service load the Prisma/Socket.io config modules; nothing here touches either.
vi.mock("../../config/prisma", () => ({ prisma: {} }));
vi.mock("../../config/socket", () => ({ getIO: () => undefined }));

const NOW = new Date("2026-11-19T12:00:00Z");
const REQUEST_ID = "6f1c1a52-6a64-4c5e-9d2b-3f0a8b7c9d10";

describe("checkTableOrderLimits", () => {
  const fresh = { guestAwaiting: 0, sessionAwaiting: 0, sessionOrders: 0, guestLastOrderAt: null };

  it("allows a first round", () => {
    expect(checkTableOrderLimits(fresh, NOW)).toEqual({ ok: true });
  });

  it("refuses at each hard cap", () => {
    expect(checkTableOrderLimits({ ...fresh, guestAwaiting: TABLE_QR_LIMITS.guestAwaitingOrders }, NOW)).toEqual({ ok: false, code: "TOO_MANY" });
    expect(checkTableOrderLimits({ ...fresh, sessionAwaiting: TABLE_QR_LIMITS.sessionAwaitingOrders }, NOW)).toEqual({ ok: false, code: "TOO_MANY" });
    expect(checkTableOrderLimits({ ...fresh, sessionOrders: TABLE_QR_LIMITS.sessionOrders }, NOW)).toEqual({ ok: false, code: "TOO_MANY" });
  });

  it("enforces the per-guest cooldown with a retry-after, and a hard cap wins over it", () => {
    const tenSecondsAgo = new Date(NOW.getTime() - 10_000);
    expect(checkTableOrderLimits({ ...fresh, guestLastOrderAt: tenSecondsAgo }, NOW)).toEqual({
      ok: false,
      code: "COOLDOWN",
      retryAfterSeconds: 20,
    });
    expect(checkTableOrderLimits({ ...fresh, guestAwaiting: 2, guestLastOrderAt: tenSecondsAgo }, NOW)).toEqual({ ok: false, code: "TOO_MANY" });
    expect(checkTableOrderLimits({ ...fresh, guestLastOrderAt: new Date(NOW.getTime() - 31_000) }, NOW)).toEqual({ ok: true });
    expect(orderCooldownSeconds(tenSecondsAgo, NOW)).toBe(20);
    expect(orderCooldownSeconds(null, NOW)).toBe(0);
  });
});

describe("deriveTableRoundStatus", () => {
  const { PENDING, PREPARING, READY, SERVED } = OrderItemStatus;
  it("maps order and item statuses to what the guest sees", () => {
    expect(deriveTableRoundStatus(OrderStatus.AWAITING_RECEPTION, [PENDING])).toBe("RECEIVED");
    expect(deriveTableRoundStatus(OrderStatus.CANCELLED, [PENDING])).toBe("CANCELLED");
    expect(deriveTableRoundStatus(OrderStatus.PENDING, [PENDING, PENDING])).toBe("SENT_TO_KITCHEN");
    expect(deriveTableRoundStatus(OrderStatus.PENDING, [PREPARING, READY])).toBe("PREPARING");
    expect(deriveTableRoundStatus(OrderStatus.PENDING, [READY, SERVED])).toBe("READY");
    expect(deriveTableRoundStatus(OrderStatus.PENDING, [SERVED, SERVED])).toBe("SERVED");
    expect(deriveTableRoundStatus(OrderStatus.COMPLETED, [PENDING])).toBe("SERVED");
  });
});

describe("computeTableOrdering", () => {
  const open = { tableQrEnabled: true, tableActive: true, outOfService: false, sessionBusinessDayId: "day-1", activeBusinessDayId: "day-1" };
  it("is open only when everything lines up, with a reason otherwise", () => {
    expect(computeTableOrdering(open)).toEqual({ orderingOpen: true, closedReason: null });
    expect(computeTableOrdering({ ...open, tableQrEnabled: false }).closedReason).toBe("qr_disabled");
    expect(computeTableOrdering({ ...open, outOfService: true }).closedReason).toBe("unavailable");
    expect(computeTableOrdering({ ...open, sessionBusinessDayId: null }).closedReason).toBe("not_seated");
    expect(computeTableOrdering({ ...open, activeBusinessDayId: null }).closedReason).toBe("no_business_day");
    // A session seated on yesterday's (since force-ended) day can't order into today's.
    expect(computeTableOrdering({ ...open, activeBusinessDayId: "day-2" }).closedReason).toBe("no_business_day");
  });
});

describe("tokens, keys and PINs", () => {
  it("have the documented shapes", () => {
    expect(isPlausibleGuestToken(generateGuestToken())).toBe(true);
    expect(isPlausibleQrKey(generateQrKey())).toBe(true);
    expect(generateJoinPin()).toMatch(/^\d{4}$/);
    expect(hashGuestToken("a")).toHaveLength(64);
    expect(isPlausibleGuestToken("short")).toBe(false);
    expect(isPlausibleQrKey("../../etc/passwd-xxxxxx")).toBe(false);
  });
});

describe("parseTableOrderBody", () => {
  const body = (over: Record<string, unknown> = {}) => ({ clientRequestId: REQUEST_ID, items: [{ menuItemId: "m1", quantity: 2 }], ...over });

  it("accepts a plain round", () => {
    expect(parseTableOrderBody(body())).toMatchObject({ clientRequestId: REQUEST_ID, items: [{ menuItemId: "m1", quantity: 2 }], deals: [] });
  });

  it("refuses a client price, a deal customization, a total, and unknown keys", () => {
    expect(() => parseTableOrderBody(body({ items: [{ menuItemId: "m1", quantity: 1, unitPrice: 1 }] }))).toThrow(TableGuestValidationError);
    expect(() => parseTableOrderBody(body({ deals: [{ dealId: "d1", quantity: 1, customization: {} }] }))).toThrow(TableGuestValidationError);
    expect(() => parseTableOrderBody(body({ total: "1" }))).toThrow(TableGuestValidationError);
  });

  it("enforces the line and quantity caps and needs a UUID request id", () => {
    expect(() => parseTableOrderBody(body({ items: [{ menuItemId: "m1", quantity: 51 }] }))).toThrow(TableGuestValidationError);
    expect(() => parseTableOrderBody(body({ items: Array.from({ length: 41 }, (_, i) => ({ menuItemId: `m${i}`, quantity: 1 })) }))).toThrow(
      TableGuestValidationError,
    );
    expect(() => parseTableOrderBody(body({ items: [] }))).toThrow(TableGuestValidationError);
    expect(() => parseTableOrderBody(body({ clientRequestId: "not-a-uuid" }))).toThrow(TableGuestValidationError);
  });
});

describe("parseJoinBody and uniqueDisplayName", () => {
  it("cleans the name and checks the PIN shape", () => {
    expect(parseJoinBody({ displayName: "  Ali\nKhan ", joinRequestId: REQUEST_ID })).toEqual({
      displayName: "Ali Khan",
      pin: undefined,
      joinRequestId: REQUEST_ID,
    });
    expect(parseJoinBody({ displayName: "Ali", pin: "0042", joinRequestId: REQUEST_ID }).pin).toBe("0042");
    expect(() => parseJoinBody({ displayName: "Ali", pin: "42", joinRequestId: REQUEST_ID })).toThrow();
    expect(() => parseJoinBody({ displayName: "", joinRequestId: REQUEST_ID })).toThrow();
  });

  it("suffixes a duplicate name within the session", () => {
    expect(uniqueDisplayName("Ali", [])).toBe("Ali");
    expect(uniqueDisplayName("ali", ["Ali"])).toBe("ali 2");
    expect(uniqueDisplayName("Ali", ["Ali", "Ali 2"])).toBe("Ali 3");
    expect(uniqueDisplayName("x".repeat(30), ["x".repeat(30)])).toHaveLength(30);
  });
});

describe("checkTableCallLimits", () => {
  it("caps open calls per session at 3, then a 60 s cooldown per guest", () => {
    expect(checkTableCallLimits({ sessionOpenCalls: 0, guestLastCallAt: null }, NOW)).toEqual({ ok: true });
    expect(checkTableCallLimits({ sessionOpenCalls: TABLE_QR_LIMITS.sessionOpenCalls, guestLastCallAt: null }, NOW)).toEqual({
      ok: false,
      code: "TOO_MANY",
    });
    const twentySecondsAgo = new Date(NOW.getTime() - 20_000);
    expect(checkTableCallLimits({ sessionOpenCalls: 1, guestLastCallAt: twentySecondsAgo }, NOW)).toEqual({
      ok: false,
      code: "COOLDOWN",
      retryAfterSeconds: 40,
    });
    // The cap wins over the cooldown.
    expect(checkTableCallLimits({ sessionOpenCalls: 3, guestLastCallAt: twentySecondsAgo }, NOW)).toEqual({ ok: false, code: "TOO_MANY" });
    expect(checkTableCallLimits({ sessionOpenCalls: 2, guestLastCallAt: new Date(NOW.getTime() - 60_000) }, NOW)).toEqual({ ok: true });
    expect(callCooldownSeconds(twentySecondsAgo, NOW)).toBe(40);
    expect(callCooldownSeconds(null, NOW)).toBe(0);
  });
});

describe("parseTableCallBody", () => {
  it("takes one of the four types, a cleaned note of at most 80 characters, required for OTHER", () => {
    expect(parseTableCallBody({ clientRequestId: REQUEST_ID, type: "WATER" })).toEqual({ clientRequestId: REQUEST_ID, type: "WATER", note: undefined });
    expect(parseTableCallBody({ clientRequestId: REQUEST_ID, type: "OTHER", note: " High\nchair " }).note).toBe("High chair");
    expect(() => parseTableCallBody({ clientRequestId: REQUEST_ID, type: "OTHER" })).toThrow();
    expect(() => parseTableCallBody({ clientRequestId: REQUEST_ID, type: "OTHER", note: "x".repeat(81) })).toThrow();
    expect(() => parseTableCallBody({ clientRequestId: REQUEST_ID, type: "MUSIC" })).toThrow(TableGuestValidationError);
    expect(() => parseTableCallBody({ clientRequestId: "nope", type: "WATER" })).toThrow(TableGuestValidationError);
    expect(() => parseTableCallBody({ clientRequestId: REQUEST_ID, type: "WATER", routedTo: "me" })).toThrow(TableGuestValidationError);
  });
});
