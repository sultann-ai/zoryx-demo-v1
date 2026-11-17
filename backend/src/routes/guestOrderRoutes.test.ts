import express from "express";
import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serve } from "../common/testServer";

// The real online router (limiters, gate, controllers) with Prisma replaced by a stub that COUNTS
// every call. "Creates nothing" and "never reaches the database" are then plain assertions.
const db = vi.hoisted(() => ({
  calls: 0,
  order: null as unknown,
  existingOrder: null as unknown,
}));

vi.mock("../config/prisma", () => {
  const touch =
    <T>(result: () => T) =>
    async () => {
      db.calls += 1;
      return result();
    };
  const model = (extra: Record<string, unknown> = {}) =>
    new Proxy(extra, {
      get: (target, property) => (property in target ? target[property as string] : touch(() => [])),
    });
  const stub: Record<string, unknown> = {
    order: model({
      findUnique: touch(() => db.order),
      update: touch(() => ({})),
      count: touch(() => 0),
    }),
    mediaAsset: model({ create: touch(() => ({ id: "proof-asset" })), deleteMany: touch(() => ({ count: 1 })) }),
    $transaction: async (fn: (tx: unknown) => unknown) => fn(stub),
  };
  for (const name of ["menuItem", "deal", "galleryImage", "paymentAccount"]) {
    stub[name] = model({ count: touch(() => 0) });
  }
  return { prisma: new Proxy(stub, { get: (target, property) => (property in target ? target[property as string] : model()) }) };
});

const VALID_ID = "abcdefghijklmnopqrstuv"; // 22 URL-safe characters
const REQUEST_ID = "6f1c1a52-6a64-4c5e-9d2b-3f0a8b7c9d10";

const body = (over: Record<string, unknown> = {}) => ({
  clientRequestId: REQUEST_ID,
  items: [{ menuItemId: "item-1", quantity: 1 }],
  customer: { name: "Ali Khan", phone: "03001234567", deliveryAreaId: "area-1", house: "12", street: "Street 5" },
  paymentMethod: "CASH",
  website: "",
  ...over,
});

let baseUrl = "";

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test";
  process.env.JWT_SECRET ??= "test-secret";
  process.env.PORT ??= "0";
  const { onlineRouter } = await import("./online.routes");
  const { errorHandler } = await import("../common/middlewares/errorHandler");
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "50kb" }));
  app.use("/api/online", onlineRouter);
  app.use(errorHandler);
  baseUrl = (await serve(app)).url;
});

beforeEach(() => {
  db.calls = 0;
  db.order = null;
});

// Each call gets its own client IP so the in-memory limiters don't interfere with one another.
let ipCounter = 1;
const post = (path: string, payload: unknown) =>
  fetch(`${baseUrl}/api/online${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.1.0.${ipCounter++}` },
    body: JSON.stringify(payload),
  });

describe("POST /api/online/guest-orders — what never reaches the database", () => {
  it("answers a filled honeypot with an ordinary-looking success and touches nothing", async () => {
    const response = await post("/guest-orders", body({ website: "http://spam.example" }));
    expect(response.status).toBe(201);
    const json = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(["deliveryFee", "orderNumber", "paymentMethod", "publicCode", "publicId", "status", "total"]);
    expect(json.publicId).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    expect(json.publicCode).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/);
    expect(json.status).toBe("RECEIVED");
    expect(db.calls).toBe(0);
  });

  it("gives the honeypot no validation feedback, even for a garbage body", async () => {
    const response = await post("/guest-orders", { website: "x", clientRequestId: "nope", items: 5 });
    expect(response.status).toBe(201);
    expect(db.calls).toBe(0);
  });

  it("rejects invalid bodies with { code, error } before any database work", async () => {
    const unknownField = await post("/guest-orders", body({ total: 5 }));
    expect(unknownField.status).toBe(400);
    expect(await unknownField.json()).toMatchObject({ code: "BAD_REQUEST", error: expect.stringContaining("total") });

    const badPhone = await post("/guest-orders", body({ customer: { ...body().customer, phone: "12345" } }));
    expect(badPhone.status).toBe(400);
    expect(await badPhone.json()).toMatchObject({ code: "BAD_PHONE" });

    const clientPrice = await post("/guest-orders", body({ items: [{ menuItemId: "i", quantity: 1, unitPrice: 1 }] }));
    expect(clientPrice.status).toBe(400);

    const customization = await post("/guest-orders", body({ items: [], deals: [{ dealId: "d", quantity: 1, customization: { items: [], finalPrice: 1 } }] }));
    expect(customization.status).toBe(400);

    expect(db.calls).toBe(0);
  });

  it("is rate limited per IP with { code: 'TOO_MANY' }", async () => {
    const send = () =>
      fetch(`${baseUrl}/api/online/guest-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "10.9.9.9" },
        body: JSON.stringify(body({ website: "bot" })),
      });
    let last: Response | undefined;
    for (let i = 0; i < 31; i += 1) last = await send();
    expect(last!.status).toBe(429);
    expect(await last!.json()).toMatchObject({ code: "TOO_MANY" });
  });
});

describe("GET /api/online/orders/:publicId", () => {
  it("is never cached and answers a malformed id without touching the database", async () => {
    const response = await fetch(`${baseUrl}/api/online/orders/not-a-real-id`);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "NOT_FOUND", error: "Order not found" });
    expect(db.calls).toBe(0);
  });

  it("answers an unknown (well-formed) id with the identical 404", async () => {
    const response = await fetch(`${baseUrl}/api/online/orders/${VALID_ID}`);
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ code: "NOT_FOUND", error: "Order not found" });
  });

  it("is public even while customer accounts are switched off, whereas the account POST /orders is a plain 404", async () => {
    const accountRoute = await post("/orders", { type: "DELIVERY" });
    expect(accountRoute.status).toBe(404);
    expect(await accountRoute.json()).toEqual({ error: "Not found" });
    db.calls = 0;
    const status = await fetch(`${baseUrl}/api/online/orders/${VALID_ID}`);
    expect(((await status.json()) as { code?: string }).code).toBe("NOT_FOUND");
  });

  it("returns the whitelisted status for a known order and no internal data", async () => {
    db.order = {
      publicCode: "K7P2M",
      status: "CONFIRMED",
      riderId: "SECRET-RIDER",
      paymentMethod: "CASH",
      paymentStatus: "PENDING",
      paymentProofMediaId: null,
      cancelledReason: null,
      discount: "0",
      deliveryFee: "150",
      totalAmount: "850",
      createdAt: new Date("2026-11-10T10:00:00Z"),
      items: [
        { status: "PREPARING", quantity: 1, subtotal: "700", variantLabel: null, addOns: null, dealOrderLineId: null, menuItem: { name: "Zinger", nameUr: null } },
      ],
      dealLines: [],
      customerPhone: "SECRET-PHONE",
      deliveryAddress: "SECRET-ADDRESS",
      notes: "SECRET-NOTES",
    };
    const response = await fetch(`${baseUrl}/api/online/orders/${VALID_ID}`);
    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(JSON.stringify(json)).not.toContain("SECRET");
    expect(json).toMatchObject({ publicCode: "K7P2M", status: "PREPARING", total: "850", deliveryFee: "150", subtotal: "700" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("POST /api/online/orders/:publicId/payment-proof", () => {
  const png = () => sharp({ create: { width: 300, height: 600, channels: 3, background: "#ffffff" } }).png().toBuffer();

  async function uploadProof(id: string, file?: { data: Buffer; type: string; name: string }) {
    const form = new FormData();
    if (file) form.append("file", new Blob([new Uint8Array(file.data)], { type: file.type }), file.name);
    return fetch(`${baseUrl}/api/online/orders/${id}/payment-proof`, {
      method: "POST",
      headers: { "X-Forwarded-For": `10.2.0.${ipCounter++}` },
      body: form,
    });
  }

  it("requires a file", async () => {
    const response = await uploadProof(VALID_ID);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects a non-image with a clean 400 and stores nothing", async () => {
    const response = await uploadProof(VALID_ID, { data: Buffer.from("not an image"), type: "image/png", name: "x.png" });
    expect(response.status).toBe(400);
    expect(db.calls).toBe(0);
    const html = await uploadProof(VALID_ID, { data: Buffer.from("<html>"), type: "text/html", name: "x.html" });
    expect(html.status).toBe(400);
  });

  it("rejects a file over 5 MB with 413", async () => {
    const big = await uploadProof(VALID_ID, { data: Buffer.alloc(6 * 1024 * 1024, 1), type: "image/png", name: "big.png" });
    expect(big.status).toBe(413);
  });

  it("404s for a malformed or unknown order id", async () => {
    expect((await uploadProof("bad", { data: await png(), type: "image/png", name: "p.png" })).status).toBe(404);
    const unknown = await uploadProof(VALID_ID, { data: await png(), type: "image/png", name: "p.png" });
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("409s unless the order is ONLINE, awaiting verification, and still open", async () => {
    const base = { id: "o1", orderNumber: 3, status: "AWAITING_RECEPTION", paymentMethod: "ONLINE", paymentStatus: "AWAITING_VERIFICATION", paymentProofMediaId: null };
    for (const wrong of [
      { paymentMethod: "CASH" },
      { paymentStatus: "VERIFIED" },
      { paymentStatus: "REJECTED" },
      { status: "CANCELLED" },
      { status: "COMPLETED" },
    ]) {
      db.order = { ...base, ...wrong };
      const response = await uploadProof(VALID_ID, { data: await png(), type: "image/png", name: "p.png" });
      expect(response.status, JSON.stringify(wrong)).toBe(409);
      expect(await response.json()).toMatchObject({ code: "NOT_AWAITING_PAYMENT" });
    }
  });

  it("stores the proof and reports PROOF_RECEIVED for an ONLINE order awaiting verification", async () => {
    db.order = { id: "o1", orderNumber: 3, status: "AWAITING_RECEPTION", paymentMethod: "ONLINE", paymentStatus: "AWAITING_VERIFICATION", paymentProofMediaId: null };
    const response = await uploadProof(VALID_ID, { data: await png(), type: "image/png", name: "screenshot.png" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ paymentState: "PROOF_RECEIVED" });
    expect(db.calls).toBeGreaterThan(0);
  });
});
