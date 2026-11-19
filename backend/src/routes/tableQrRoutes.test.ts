import express from "express";
import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { serve } from "../common/testServer";

// The real routers (limiters, role middleware, guest-token middleware, controllers) with Prisma
// stubbed: every query answers "nothing" and is COUNTED, so "refused before touching the database"
// is a plain assertion. requireAuth's staff lookup answers "active, with the token's role".
const db = vi.hoisted(() => ({ calls: 0 }));

vi.mock("../config/prisma", () => {
  const stub: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "$transaction") {
          return (fn: (tx: unknown) => unknown) => fn(stub);
        }
        if (property === "staffUser") {
          const row = async ({ where }: { where: { id: string } }) => ({
            id: where.id,
            isActive: true,
            role: where.id.slice("staff-".length),
            kitchenId: null,
          });
          return new Proxy({}, { get: (_t, method) => (method === "findUnique" ? row : async () => null) });
        }
        return new Proxy(
          {},
          {
            get: (_t, method) => async () => {
              db.calls += 1;
              return method === "findMany" ? [] : method === "count" ? 0 : null;
            },
          },
        );
      },
    },
  );
  return { prisma: stub };
});

let baseUrl = "";
let tokenFor: (role: string) => string;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test";
  process.env.JWT_SECRET ??= "test-secret";
  process.env.PORT ??= "0";
  const { env } = await import("../config/env");
  const { posRouter } = await import("./pos.routes");
  const { onlineRouter } = await import("./online.routes");
  const { errorHandler } = await import("../common/middlewares/errorHandler");
  tokenFor = (role) => jwt.sign({ id: `staff-${role}`, role, kitchenId: null }, env.JWT_SECRET, { expiresIn: "5m" });
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/pos", posRouter);
  app.use("/api/online", onlineRouter);
  app.use(errorHandler);
  baseUrl = (await serve(app)).url;
});

let ip = 1;
async function call(method: string, path: string, options: { role?: string; guestToken?: string; body?: unknown } = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `10.9.0.${ip++}`,
      ...(options.role ? { Authorization: `Bearer ${tokenFor(options.role)}` } : {}),
      ...(options.guestToken ? { "X-Table-Token": options.guestToken } : {}),
    },
    ...(method !== "GET" ? { body: JSON.stringify(options.body ?? {}) } : {}),
  });
}

describe("public Table QR routes", () => {
  it("answers a malformed QR key 404 NOT_FOUND without a database query", async () => {
    db.calls = 0;
    for (const path of ["/api/online/table/short", "/api/online/table/x/join"]) {
      const response = await call(path.endsWith("join") ? "POST" : "GET", path);
      expect(response.status, path).toBe(404);
      expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    }
    expect(db.calls).toBe(0);
  });

  it("refuses guest routes without a token (or with a malformed one) as 401 SESSION_ENDED, before any query", async () => {
    db.calls = 0;
    for (const [method, path] of [
      ["GET", "/api/online/table/session"],
      ["POST", "/api/online/table/orders"],
      ["POST", "/api/online/table/orders/some-id/cancel"],
      ["POST", "/api/online/table/calls"],
      ["POST", "/api/online/table/calls/some-id/cancel"],
    ] as const) {
      const response = await call(method, path, method === "GET" ? {} : { guestToken: "not-a-token" });
      expect(response.status, path).toBe(401);
      expect(await response.json()).toMatchObject({ code: "SESSION_ENDED" });
    }
    expect(db.calls).toBe(0);
  });

  it("serves /menu as the QR menu, not as a table key", async () => {
    const response = await call("GET", "/api/online/table/menu");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(await response.json()).toEqual({ categories: [], items: [], deals: [] });
  });

  it("a staff JWT is not a guest token", async () => {
    const response = await call("GET", "/api/online/table/session", { role: "SUPER_ADMIN" });
    expect(response.status).toBe(401);
  });
});

describe("staff Table QR routes: roles", () => {
  const reaches = (status: number) => status !== 401 && status !== 403;

  it("lets the floor roles (SA, PA, ORDER_TAKER) read the floor and seat; keeps KITCHEN and ONLINE_ADMIN out", async () => {
    for (const role of ["SUPER_ADMIN", "POS_ADMIN", "ORDER_TAKER"]) {
      expect(reaches((await call("GET", "/api/pos/tables/floor", { role })).status), role).toBe(true);
      expect(reaches((await call("POST", "/api/pos/tables/t1/seat", { role })).status), role).toBe(true);
      expect(reaches((await call("POST", "/api/pos/table-sessions/s1/close", { role })).status), role).toBe(true);
    }
    for (const role of ["KITCHEN", "ONLINE_ADMIN"]) {
      expect((await call("GET", "/api/pos/tables/floor", { role })).status, role).toBe(403);
      expect((await call("POST", "/api/pos/tables/t1/seat", { role })).status, role).toBe(403);
    }
    expect((await call("GET", "/api/pos/tables/floor")).status).toBe(401);
  });

  it("lets the floor roles list, acknowledge and resolve waiter calls; keeps KITCHEN and ONLINE_ADMIN out", async () => {
    for (const role of ["SUPER_ADMIN", "POS_ADMIN", "ORDER_TAKER"]) {
      expect((await call("GET", "/api/pos/table-calls", { role })).status, role).toBe(200);
      expect(reaches((await call("POST", "/api/pos/table-calls/c1/acknowledge", { role })).status), role).toBe(true);
      expect(reaches((await call("POST", "/api/pos/table-calls/c1/resolve", { role })).status), role).toBe(true);
    }
    for (const role of ["KITCHEN", "ONLINE_ADMIN"]) {
      expect((await call("GET", "/api/pos/table-calls", { role })).status, role).toBe(403);
      expect((await call("POST", "/api/pos/table-calls/c1/acknowledge", { role })).status, role).toBe(403);
    }
    expect((await call("GET", "/api/pos/table-calls?status=bogus", { role: "POS_ADMIN" })).status).toBe(400);
  });

  it("keeps layout, QR keys and void to SA/PA", async () => {
    for (const [method, path] of [
      ["PUT", "/api/pos/tables/layout"],
      ["GET", "/api/pos/tables/qr-sheet"],
      ["POST", "/api/pos/dining-areas/t1/qr-key/regenerate"],
      ["POST", "/api/pos/table-sessions/s1/void"],
    ] as const) {
      expect((await call(method, path, { role: "ORDER_TAKER" })).status, path).toBe(403);
      expect(reaches((await call(method, path, { role: "POS_ADMIN" })).status), path).toBe(true);
    }
  });

  it("lets ONLINE_ADMIN (like SA/PA) set an item's QR flag, but not an order taker", async () => {
    expect((await call("PATCH", "/api/pos/menu/m1/qr-availability", { role: "ORDER_TAKER", body: { isAvailableOnQr: true } })).status).toBe(403);
    expect(reaches((await call("PATCH", "/api/pos/menu/m1/qr-availability", { role: "ONLINE_ADMIN", body: { isAvailableOnQr: true } })).status)).toBe(true);
  });
});
