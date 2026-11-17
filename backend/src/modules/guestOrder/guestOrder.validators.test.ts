import { describe, expect, it } from "vitest";
import {
  buildDeliveryAddress,
  cleanText,
  GuestOrderValidationError,
  MAX_LINE_QUANTITY,
  MAX_ORDER_LINES,
  parseGuestOrderBody,
} from "./guestOrder.validators";

const REQUEST_ID = "6f1c1a52-6a64-4c5e-9d2b-3f0a8b7c9d10";

const validBody = (over: Record<string, unknown> = {}) => ({
  clientRequestId: REQUEST_ID,
  items: [{ menuItemId: "item-1", quantity: 2 }],
  deals: [],
  customer: { name: "Ali Khan", phone: "0300 123 4567", deliveryAreaId: "area-1", house: "12", street: "Street 5" },
  paymentMethod: "CASH",
  website: "",
  ...over,
});

function failure(body: unknown): GuestOrderValidationError {
  try {
    parseGuestOrderBody(body);
  } catch (error) {
    if (error instanceof GuestOrderValidationError) return error;
    throw error;
  }
  throw new Error("expected a validation error");
}

describe("parseGuestOrderBody — the happy path", () => {
  it("parses a minimal order and normalises the phone and ids", () => {
    const parsed = parseGuestOrderBody(validBody({ clientRequestId: REQUEST_ID.toUpperCase() }));
    expect(parsed.kind).toBe("order");
    if (parsed.kind !== "order") return;
    expect(parsed.order.clientRequestId).toBe(REQUEST_ID);
    expect(parsed.order.orderType).toBe("DELIVERY"); // no orderType sent: old clients keep working
    expect(parsed.order.customer).toEqual({
      name: "Ali Khan",
      phone: "03001234567",
      deliveryAreaId: "area-1",
      house: "12",
      street: "Street 5",
      landmark: undefined,
    });
    expect(parsed.order.items).toEqual([{ menuItemId: "item-1", quantity: 2 }]);
    expect(parsed.order.paymentMethod).toBe("CASH");
  });

  it("accepts deals, add-ons, sizes, line notes, a landmark and order notes", () => {
    const parsed = parseGuestOrderBody(
      validBody({
        items: [{ menuItemId: "i", quantity: 1, variantId: "v", addOnIds: ["a"], notes: "no onion" }],
        deals: [{ dealId: "d", quantity: 3, notes: "extra spicy" }],
        customer: { name: "Ali", phone: "+923001234567", deliveryAreaId: "a", house: "1", street: "St", landmark: "Near the mosque" },
        notes: "Ring the bell",
        paymentMethod: "ONLINE",
      }),
    );
    expect(parsed.kind).toBe("order");
  });
});

describe("parseGuestOrderBody — honeypot", () => {
  it("returns the honeypot result for a filled website field, before any other validation", () => {
    expect(parseGuestOrderBody({ website: "http://spam.example" })).toEqual({ kind: "honeypot" });
    // Even a body that is otherwise garbage — the bot gets no validation feedback at all.
    expect(parseGuestOrderBody({ website: "x", clientRequestId: "nope", items: "?", extra: 1 })).toEqual({ kind: "honeypot" });
  });

  it("treats an empty or absent website as a real order", () => {
    expect(parseGuestOrderBody(validBody({ website: "" })).kind).toBe("order");
    const { website: _website, ...withoutWebsite } = validBody();
    expect(parseGuestOrderBody(withoutWebsite).kind).toBe("order");
  });

  it("rejects a non-string website", () => {
    expect(failure(validBody({ website: 5 })).code).toBe("BAD_REQUEST");
  });
});

describe("parseGuestOrderBody — strictness", () => {
  it("rejects unknown fields at the top level, in customer, and in every line", () => {
    expect(failure(validBody({ total: 1 })).message).toContain("total");
    expect(failure(validBody({ customer: { ...validBody().customer, email: "x" } })).message).toContain("customer.email");
    expect(failure(validBody({ items: [{ menuItemId: "i", quantity: 1, unitPrice: 1 }] })).message).toContain("items[0].unitPrice");
    expect(failure(validBody({ items: [{ menuItemId: "i", quantity: 1, price: 1 }] })).message).toContain("items[0].price");
    expect(failure(validBody({ items: [], deals: [{ dealId: "d", quantity: 1, customization: {} }] })).message).toContain(
      "deals[0].customization",
    );
    expect(failure(validBody({ deliveryFee: 0 })).message).toContain("deliveryFee");
  });

  it("rejects a body that is not an object, and a missing customer", () => {
    for (const bad of [null, [], "x", 5]) expect(failure(bad).code).toBe("BAD_REQUEST");
    const { customer: _customer, ...noCustomer } = validBody();
    expect(failure(noCustomer).message).toContain("customer");
  });

  it("requires a UUID clientRequestId and a CASH/ONLINE paymentMethod", () => {
    expect(failure(validBody({ clientRequestId: "abc" })).message).toContain("clientRequestId");
    expect(failure(validBody({ clientRequestId: undefined })).message).toContain("clientRequestId");
    expect(failure(validBody({ paymentMethod: "CARD" })).message).toContain("paymentMethod");
    expect(failure(validBody({ paymentMethod: undefined })).message).toContain("paymentMethod");
  });
});

describe("parseGuestOrderBody — customer fields", () => {
  const withCustomer = (over: Record<string, unknown>) => validBody({ customer: { ...validBody().customer, ...over } });

  it("reports BAD_PHONE for an invalid phone", () => {
    for (const phone of ["12345", "0200 1234567", "", "abc", 3001234567, undefined]) {
      expect(failure(withCustomer({ phone })).code, String(phone)).toBe("BAD_PHONE");
    }
  });

  it("enforces the length limits (name 2-60, house 1-60, street 2-120, landmark <= 100)", () => {
    expect(failure(withCustomer({ name: "A" })).message).toContain("customer.name");
    expect(failure(withCustomer({ name: "A".repeat(61) })).message).toContain("customer.name");
    expect(failure(withCustomer({ house: "" })).message).toContain("customer.house");
    expect(failure(withCustomer({ house: "1".repeat(61) })).message).toContain("customer.house");
    expect(failure(withCustomer({ street: "S" })).message).toContain("customer.street");
    expect(failure(withCustomer({ street: "S".repeat(121) })).message).toContain("customer.street");
    expect(failure(withCustomer({ landmark: "L".repeat(101) })).message).toContain("customer.landmark");
    expect(parseGuestOrderBody(withCustomer({ name: "Al", house: "1", street: "St", landmark: "L".repeat(100) })).kind).toBe("order");
  });

  it("treats a blank landmark as absent and requires a delivery area", () => {
    const parsed = parseGuestOrderBody(withCustomer({ landmark: "   " }));
    expect(parsed.kind === "order" && (parsed.order.customer as { landmark?: string }).landmark).toBeUndefined();
    expect(failure(withCustomer({ deliveryAreaId: "" })).message).toContain("deliveryAreaId");
    expect(failure(withCustomer({ deliveryAreaId: undefined })).message).toContain("deliveryAreaId");
  });

  it("cleans control characters and whitespace so a name can't break a printed slip", () => {
    const parsed = parseGuestOrderBody(withCustomer({ name: "  Ali\n\tKhan\u0000  ", street: "Street\r\n 5" }));
    expect(parsed.kind === "order" && parsed.order.customer.name).toBe("Ali Khan");
    expect(parsed.kind === "order" && (parsed.order.customer as { street?: string }).street).toBe("Street 5");
    expect(cleanText("a\u007Fb", "x", 1, 10)).toBe("a b");
  });

  it("limits order notes to 200 characters", () => {
    expect(failure(validBody({ notes: "n".repeat(201) })).message).toContain("notes");
  });
});

describe("parseGuestOrderBody — lines", () => {
  it("needs at least one line", () => {
    expect(failure(validBody({ items: [], deals: [] })).message).toContain("at least one");
    expect(failure(validBody({ items: undefined, deals: undefined })).message).toContain("at least one");
  });

  it(`allows at most ${MAX_ORDER_LINES} lines across items and deals`, () => {
    const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ menuItemId: `i${i}`, quantity: 1 }));
    expect(parseGuestOrderBody(validBody({ items: lines(MAX_ORDER_LINES) })).kind).toBe("order");
    expect(failure(validBody({ items: lines(MAX_ORDER_LINES + 1) })).message).toContain(`${MAX_ORDER_LINES}`);
    expect(failure(validBody({ items: lines(MAX_ORDER_LINES), deals: [{ dealId: "d", quantity: 1 }] })).message).toContain(`${MAX_ORDER_LINES}`);
  });

  it(`keeps quantities between 1 and ${MAX_LINE_QUANTITY}, for items and deals`, () => {
    expect(parseGuestOrderBody(validBody({ items: [{ menuItemId: "i", quantity: MAX_LINE_QUANTITY }] })).kind).toBe("order");
    expect(failure(validBody({ items: [{ menuItemId: "i", quantity: MAX_LINE_QUANTITY + 1 }] })).message).toContain("quantity");
    expect(failure(validBody({ items: [], deals: [{ dealId: "d", quantity: 51 }] })).message).toContain("quantity");
    for (const quantity of [0, -1, 1.5, "2", null]) {
      expect(failure(validBody({ items: [{ menuItemId: "i", quantity }] })).code, String(quantity)).toBe("BAD_REQUEST");
    }
  });

  it("surfaces the shared parsers' errors as BAD_REQUEST", () => {
    expect(failure(validBody({ items: [{ quantity: 1 }] })).message).toContain("menuItemId");
    expect(failure(validBody({ items: "nope" })).message).toContain("items");
  });
});

describe("buildDeliveryAddress", () => {
  it("is 'House <house>, <street>, <area>' with the landmark on a new line", () => {
    expect(buildDeliveryAddress({ house: "12", street: "Street 5", areaName: "DHA Phase 2", landmark: undefined })).toBe(
      "House 12, Street 5, DHA Phase 2",
    );
    expect(buildDeliveryAddress({ house: "12", street: "Street 5", areaName: "DHA Phase 2", landmark: "Near the mosque" })).toBe(
      "House 12, Street 5, DHA Phase 2\nLandmark: Near the mosque",
    );
  });
});

describe("parseGuestOrderBody — order type (delivery or pickup)", () => {
  const pickup = (over: Record<string, unknown> = {}) =>
    validBody({ orderType: "PICKUP", customer: { name: "Ali Khan", phone: "03001234567" }, ...over });

  it("defaults to DELIVERY and accepts an explicit DELIVERY", () => {
    const parsed = parseGuestOrderBody(validBody({ orderType: "DELIVERY" }));
    expect(parsed.kind === "order" && parsed.order.orderType).toBe("DELIVERY");
  });

  it("rejects anything that is not DELIVERY or PICKUP", () => {
    expect(failure(validBody({ orderType: "TAKEAWAY" })).message).toContain("orderType");
    expect(failure(validBody({ orderType: "pickup" })).message).toContain("orderType");
    expect(failure(validBody({ orderType: 1 })).message).toContain("orderType");
  });

  it("a PICKUP needs only a name and a phone, and carries no delivery details", () => {
    const parsed = parseGuestOrderBody(pickup());
    expect(parsed.kind).toBe("order");
    if (parsed.kind !== "order") return;
    expect(parsed.order.orderType).toBe("PICKUP");
    expect(parsed.order.customer).toEqual({ name: "Ali Khan", phone: "03001234567" });
  });

  it("IGNORES area, house, street and landmark on a PICKUP, even invalid ones", () => {
    const parsed = parseGuestOrderBody(
      pickup({ customer: { name: "Ali Khan", phone: "03001234567", deliveryAreaId: "", house: "", street: "S", landmark: "L".repeat(500) } }),
    );
    expect(parsed.kind).toBe("order");
    if (parsed.kind !== "order") return;
    expect(parsed.order.customer).toEqual({ name: "Ali Khan", phone: "03001234567" });
  });

  it("still requires a valid name and phone for a PICKUP", () => {
    expect(failure(pickup({ customer: { name: "A", phone: "03001234567" } })).message).toContain("customer.name");
    expect(failure(pickup({ customer: { name: "Ali Khan", phone: "12345" } })).code).toBe("BAD_PHONE");
  });

  it("still rejects unknown keys on a PICKUP, and keeps the honeypot first", () => {
    expect(failure(pickup({ customer: { name: "Ali Khan", phone: "03001234567", email: "x" } })).message).toContain("customer.email");
    expect(failure(pickup({ extra: 1 })).message).toContain("extra");
    expect(parseGuestOrderBody(pickup({ website: "spam", orderType: "NOPE" })).kind).toBe("honeypot");
  });
});
