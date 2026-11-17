import express from "express";
import jwt from "jsonwebtoken";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serve } from "../common/testServer";

// Real POS router + role middleware + controllers, Prisma stubbed to resolve [] for every query —
// except order.findUnique, whose answer a test can set (so "an ONLINE order" vs "someone else's").
const state = vi.hoisted(() => ({ orderRow: [] as unknown }));

vi.mock("../config/prisma", () => {
  const db: Record<string | symbol, unknown> = new Proxy(
    {},
    {
      get: (_target, property) => {
        if (property === "$transaction") {
          return (fn: (tx: unknown) => unknown) => fn(db);
        }
        if (property === "order") {
          return new Proxy({}, { get: (_t, method) => (method === "findUnique" ? async () => state.orderRow : async () => []) });
        }
        // requireAuth loads the staff row on every request: answer "active, with the token's role"
        // (each test token's id is "staff-<ROLE>", see tokenFor).
        if (property === "staffUser") {
          const row = async ({ where }: { where: { id: string } }) => ({ id: where.id, isActive: true, role: where.id.slice("staff-".length), kitchenId: null });
          return new Proxy({}, { get: (_t, method) => (method === "findUnique" ? row : async () => []) });
        }
        return new Proxy({}, { get: () => async () => [] });
      },
    },
  );
  return { prisma: db };
});

let baseUrl = "";
let tokenFor: (role: string) => string;

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test";
  process.env.JWT_SECRET ??= "test-secret";
  process.env.PORT ??= "0";
  const { env } = await import("../config/env");
  const { posRouter } = await import("./pos.routes");
  const { errorHandler } = await import("../common/middlewares/errorHandler");
  tokenFor = (role) => jwt.sign({ id: `staff-${role}`, role, kitchenId: null }, env.JWT_SECRET, { expiresIn: "5m" });
  const app = express();
  app.use(express.json());
  app.use("/api/pos", posRouter);
  app.use(errorHandler);
  baseUrl = (await serve(app)).url;
});

beforeEach(() => {
  state.orderRow = [];
});

async function call(method: string, path: string, role?: string, body: unknown = {}) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${tokenFor(role)}` } : {}) },
    ...(method === "POST" || method === "PATCH" ? { body: JSON.stringify(body) } : {}),
  });
}

const reaches = (status: number) => status !== 401 && status !== 403;

describe("POST /api/pos/orders/:id/complete", () => {
  const path = "/api/pos/orders/some-id/complete";

  it("needs a token", async () => {
    expect((await call("POST", path)).status).toBe(401);
  });

  it("is open to POS_ADMIN and SUPER_ADMIN only", async () => {
    for (const role of ["POS_ADMIN", "SUPER_ADMIN"]) {
      expect(reaches((await call("POST", path, role)).status), role).toBe(true);
    }
    for (const role of ["ONLINE_ADMIN", "ORDER_TAKER", "KITCHEN"]) {
      expect((await call("POST", path, role)).status, role).toBe(403);
    }
  });
});

describe("POST /api/pos/orders/:id/delivered", () => {
  const path = "/api/pos/orders/some-id/delivered";

  it("needs a token", async () => {
    expect((await call("POST", path)).status).toBe(401);
  });

  it("is open to POS_ADMIN and SUPER_ADMIN only", async () => {
    for (const role of ["POS_ADMIN", "SUPER_ADMIN"]) {
      expect(reaches((await call("POST", path, role)).status), role).toBe(true);
    }
    for (const role of ["ONLINE_ADMIN", "ORDER_TAKER", "KITCHEN"]) {
      expect((await call("POST", path, role)).status, role).toBe(403);
    }
  });
});

describe("POST /api/pos/orders/:id/not-collected", () => {
  const path = "/api/pos/orders/some-id/not-collected";

  it("needs a token", async () => {
    expect((await call("POST", path)).status).toBe(401);
  });

  it("is open to POS_ADMIN and SUPER_ADMIN only", async () => {
    for (const role of ["POS_ADMIN", "SUPER_ADMIN"]) {
      expect(reaches((await call("POST", path, role)).status), role).toBe(true);
    }
    for (const role of ["ONLINE_ADMIN", "ORDER_TAKER", "KITCHEN"]) {
      expect((await call("POST", path, role)).status, role).toBe(403);
    }
  });

  it("is a 404 for an unknown order", async () => {
    state.orderRow = null;
    expect((await call("POST", path, "POS_ADMIN")).status).toBe(404);
  });

  it("is a 409 NOT_COLLECTABLE for a delivery order, a POS order, or one that is already finished", async () => {
    for (const row of [
      { status: "CONFIRMED", source: "ONLINE", type: "DELIVERY" },
      { status: "CONFIRMED", source: "POS", type: "TAKEAWAY" },
      { status: "COMPLETED", source: "ONLINE", type: "TAKEAWAY" },
      { status: "AWAITING_RECEPTION", source: "ONLINE", type: "TAKEAWAY" },
      { status: "CANCELLED", source: "ONLINE", type: "TAKEAWAY" },
    ]) {
      state.orderRow = row;
      const response = await call("POST", path, "POS_ADMIN");
      expect(response.status, JSON.stringify(row)).toBe(409);
      expect(((await response.json()) as { code: string }).code).toBe("NOT_COLLECTABLE");
    }
  });
});

describe("PATCH /api/pos/orders/:id/cancel", () => {
  const path = "/api/pos/orders/some-id/cancel";

  it("needs a reason of 1-200 characters from POS_ADMIN/SUPER_ADMIN", async () => {
    state.orderRow = { id: "some-id", status: "PENDING", paymentStatus: "PENDING", items: [] };
    for (const body of [{}, { cancelledReason: "   " }, { cancelledReason: "x".repeat(201) }]) {
      expect((await call("PATCH", path, "SUPER_ADMIN", body)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
  });

  it("is a 409 NOT_CANCELLABLE with a clear message for a completed order", async () => {
    state.orderRow = { id: "some-id", status: "COMPLETED", paymentStatus: "VERIFIED", items: [] };
    const response = await call("PATCH", path, "POS_ADMIN", { cancelledReason: "Customer complained" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "NOT_CANCELLABLE", error: "Completed orders can't be cancelled" });
  });

  it("is a 404 for an unknown order", async () => {
    state.orderRow = null;
    expect((await call("PATCH", path, "SUPER_ADMIN", { cancelledReason: "x" })).status).toBe(404);
  });
});

describe("GET /api/pos/orders/:id/events", () => {
  const path = "/api/pos/orders/some-id/events";

  it("needs a token", async () => {
    expect((await call("GET", path)).status).toBe(401);
  });

  it("is open to POS_ADMIN and SUPER_ADMIN only", async () => {
    state.orderRow = { source: "POS" };
    for (const role of ["POS_ADMIN", "SUPER_ADMIN"]) {
      expect((await call("GET", path, role)).status, role).toBe(200);
    }
    for (const role of ["ONLINE_ADMIN", "ORDER_TAKER", "KITCHEN"]) {
      expect((await call("GET", path, role)).status, role).toBe(403);
    }
  });

  it("is a 404 for an unknown order", async () => {
    state.orderRow = null;
    expect((await call("GET", path, "SUPER_ADMIN")).status).toBe(404);
  });
});

describe("GET /api/pos/orders/:id/payment-proof", () => {
  const path = "/api/pos/orders/some-id/payment-proof";

  it("needs a token", async () => {
    expect((await call("GET", path)).status).toBe(401);
  });

  it("is open to POS_ADMIN, SUPER_ADMIN and ONLINE_ADMIN, closed to everyone else", async () => {
    for (const role of ["POS_ADMIN", "SUPER_ADMIN", "ONLINE_ADMIN"]) {
      expect(reaches((await call("GET", path, role)).status), role).toBe(true);
    }
    for (const role of ["ORDER_TAKER", "KITCHEN"]) {
      expect((await call("GET", path, role)).status, role).toBe(403);
    }
  });

  it("answers 404 when the order has no proof, and 400 for a bad size", async () => {
    expect((await call("GET", path, "POS_ADMIN")).status).toBe(404);
    expect((await call("GET", `${path}?size=huge`, "POS_ADMIN")).status).toBe(400);
  });
});

describe("GET /api/pos/orders/incoming", () => {
  it("is open to POS_ADMIN, SUPER_ADMIN and ONLINE_ADMIN; closed to order-takers and kitchens", async () => {
    expect((await call("GET", "/api/pos/orders/incoming")).status).toBe(401);
    for (const role of ["POS_ADMIN", "SUPER_ADMIN", "ONLINE_ADMIN"]) {
      expect((await call("GET", "/api/pos/orders/incoming", role)).status, role).toBe(200);
    }
    for (const role of ["ORDER_TAKER", "KITCHEN"]) {
      expect((await call("GET", "/api/pos/orders/incoming", role)).status, role).toBe(403);
    }
  });

  it("?code= accepts a valid code in any case and refuses a malformed one with 400", async () => {
    for (const code of ["K7P2M", "k7p2m", "k7-p2m"]) {
      expect((await call("GET", `/api/pos/orders/incoming?code=${code}`, "POS_ADMIN")).status, code).toBe(200);
    }
    for (const code of ["K7P2", "K7P20", "", "TOOLONGCODE", "K7P2%20"]) {
      expect((await call("GET", `/api/pos/orders/incoming?code=${code}`, "POS_ADMIN")).status, code).toBe(400);
    }
  });
});

describe("accept / reject from Incoming", () => {
  const accept = "/api/pos/orders/some-id/accept";
  const reject = "/api/pos/orders/some-id/reject";

  it("need a token and stay closed to order-takers and kitchens", async () => {
    for (const path of [accept, reject]) {
      expect((await call("POST", path)).status, path).toBe(401);
      for (const role of ["ORDER_TAKER", "KITCHEN"]) {
        expect((await call("POST", path, role, { reason: "x" })).status, `${role} ${path}`).toBe(403);
      }
    }
  });

  it("an ONLINE_ADMIN can act on an ONLINE order", async () => {
    state.orderRow = { source: "ONLINE", status: "AWAITING_RECEPTION" };
    for (const [path, body] of [
      [accept, {}],
      [reject, { reason: "Item not available" }],
    ] as const) {
      const { status } = await call("POST", path, "ONLINE_ADMIN", body);
      // Past the role and the source scope (the stub order then fails inside the service: not a 403/404).
      expect([401, 403, 404], `${path} -> ${status}`).not.toContain(status);
    }
  });

  it("an ONLINE_ADMIN gets a 404 — not a 403 — for an order that isn't online, or doesn't exist", async () => {
    for (const source of ["ORDER_TAKER", "POS", undefined]) {
      state.orderRow = source ? { source, status: "AWAITING_RECEPTION" } : [];
      expect((await call("POST", accept, "ONLINE_ADMIN", {})).status, `accept ${source}`).toBe(404);
      expect((await call("POST", reject, "ONLINE_ADMIN", { reason: "x" })).status, `reject ${source}`).toBe(404);
    }
  });

  it("an ONLINE_ADMIN may not give a discount (that changes a price)", async () => {
    state.orderRow = { source: "ONLINE", status: "AWAITING_RECEPTION" };
    expect((await call("POST", accept, "ONLINE_ADMIN", { discount: 50 })).status).toBe(403);
  });

  it("POS_ADMIN and SUPER_ADMIN are not scoped by source and may give a discount", async () => {
    state.orderRow = { source: "ORDER_TAKER", status: "AWAITING_RECEPTION" };
    for (const role of ["POS_ADMIN", "SUPER_ADMIN"]) {
      const { status } = await call("POST", accept, role, { discount: 50 });
      expect([401, 403, 404], `${role} -> ${status}`).not.toContain(status);
    }
  });
});
