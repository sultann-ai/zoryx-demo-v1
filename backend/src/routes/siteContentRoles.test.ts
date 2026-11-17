import express from "express";
import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { serve } from "../common/testServer";

// The real POS router, real auth/role middleware, real controllers — with Prisma replaced by a stub
// whose every query resolves to []. That is enough to tell "the role guard let this through" (any
// status other than 401/403) from "the role guard stopped it", without a database.
vi.mock("../config/prisma", () => {
  const db: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "$transaction") {
          return (fn: (tx: unknown) => unknown) => fn(db);
        }
        // requireAuth loads the staff row on every request: answer "active".
        if (property === "staffUser") {
          return new Proxy({}, { get: (_t, method) => (method === "findUnique" ? async () => ({ id: "staff-1", isActive: true }) : async () => []) });
        }
        return new Proxy({}, { get: () => async () => [] });
      },
    },
  );
  return { prisma: db };
});

const EDITORS = ["SUPER_ADMIN", "POS_ADMIN", "ONLINE_ADMIN"] as const;
const OTHERS = ["KITCHEN", "ORDER_TAKER"] as const;

// Every new admin route.
const ROUTES: [method: string, path: string][] = [
  ["POST", "/api/pos/media"],
  ["GET", "/api/pos/site-settings"],
  ["PUT", "/api/pos/site-settings"],
  ...["delivery-areas", "payment-accounts", "gallery", "testimonials"].flatMap((name): [string, string][] => [
    ["GET", `/api/pos/${name}`],
    ["POST", `/api/pos/${name}`],
    ["PUT", `/api/pos/${name}/some-id`],
    ["DELETE", `/api/pos/${name}/some-id`],
  ]),
  ["PATCH", "/api/pos/menu/some-id/online-content"],
  ["PATCH", "/api/pos/categories/some-id/online-content"],
  ["PATCH", "/api/pos/deals/some-id/online-content"],
];

let baseUrl = "";
let tokenFor: (role: string) => string;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test";
  process.env.JWT_SECRET ??= "test-secret";
  process.env.PORT ??= "0";
  const { env } = await import("../config/env");
  const { posRouter } = await import("./pos.routes");
  const { errorHandler } = await import("../common/middlewares/errorHandler");

  tokenFor = (role) => jwt.sign({ id: "staff-1", role, kitchenId: null }, env.JWT_SECRET, { expiresIn: "5m" });

  const app = express();
  app.use(express.json());
  app.use("/api/pos", posRouter);
  app.use(errorHandler);
  const server = await serve(app);
  baseUrl = server.url;
});

async function call(method: string, path: string, role?: string, body: unknown = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(role ? { Authorization: `Bearer ${tokenFor(role)}` } : {}),
    },
    ...(method === "GET" || method === "DELETE" ? {} : { body: JSON.stringify(body) }),
  });
}

describe("website-content admin routes", () => {
  it("require a staff token", async () => {
    for (const [method, path] of ROUTES) {
      expect((await call(method, path)).status, `${method} ${path}`).toBe(401);
    }
  });

  it("are closed to KITCHEN and ORDER_TAKER", async () => {
    for (const role of OTHERS) {
      for (const [method, path] of ROUTES) {
        expect((await call(method, path, role)).status, `${role} ${method} ${path}`).toBe(403);
      }
    }
  });

  it("are open to SUPER_ADMIN, POS_ADMIN and ONLINE_ADMIN", async () => {
    for (const role of EDITORS) {
      for (const [method, path] of ROUTES) {
        const { status } = await call(method, path, role);
        expect([401, 403], `${role} ${method} ${path} -> ${status}`).not.toContain(status);
      }
    }
  });
});

describe("ONLINE_ADMIN can never reach prices or kitchens", () => {
  it("is refused (403) on every existing menu/deal/category write", async () => {
    for (const [method, path] of [
      ["POST", "/api/pos/menu"],
      ["PUT", "/api/pos/menu/some-id"],
      ["DELETE", "/api/pos/menu/some-id"],
      ["POST", "/api/pos/menu/some-id/variants"],
      ["PUT", "/api/pos/menu/some-id/variants/v1"],
      ["POST", "/api/pos/deals"],
      ["PUT", "/api/pos/deals/some-id"],
      ["POST", "/api/pos/categories"],
      ["PUT", "/api/pos/categories/some-id"],
    ] as const) {
      expect((await call(method, path, "ONLINE_ADMIN")).status, `${method} ${path}`).toBe(403);
    }
  });

  it("gets a 400 — not a silent ignore — if it sends a price or kitchen to an online-content route", async () => {
    for (const [path, body] of [
      ["/api/pos/menu/some-id/online-content", { price: 1 }],
      ["/api/pos/menu/some-id/online-content", { kitchenId: "k" }],
      ["/api/pos/menu/some-id/online-content", { nameUr: "چائے", minPrice: 5 }],
      ["/api/pos/deals/some-id/online-content", { price: 1 }],
      ["/api/pos/categories/some-id/online-content", { name: "renamed" }],
    ] as const) {
      const response = await call("PATCH", path, "ONLINE_ADMIN", body);
      expect(response.status, path).toBe(400);
      expect(((await response.json()) as { error: string }).error).toContain("is not an editable field");
    }
  });

  it("can still update the website fields", async () => {
    const response = await call("PATCH", "/api/pos/menu/some-id/online-content", "ONLINE_ADMIN", {
      nameUr: "دودھ پتی",
      isFeatured: true,
    });
    expect(response.status).toBe(200);
  });
});
