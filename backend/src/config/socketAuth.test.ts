import express from "express";
import { createServer } from "http";
import { AddressInfo } from "net";
import jwt from "jsonwebtoken";
import { io as connect, Socket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// A real Socket.io server (initSocket) and the real staff routes, with Prisma replaced by a tiny
// in-memory staff table — enough to check the handshake against the account and that changing the
// account ends its live sockets.
const db = vi.hoisted(() => ({
  staff: new Map<string, { id: string; name: string; username: string; role: string; kitchenId: string | null; isActive: boolean; employeeId: null }>(),
}));

vi.mock("./prisma", () => {
  const staffUser = {
    // Copies, like Prisma: a caller's "before" must not change when the row is updated.
    findUnique: async ({ where }: { where: { id: string } }) => {
      const row = db.staff.get(where.id);
      return row ? { ...row } : null;
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = db.staff.get(where.id);
      if (!row) throw Object.assign(new Error("not found"), { code: "P2025" });
      Object.assign(row, Object.fromEntries(Object.entries(data).filter(([key]) => key in row)));
      return { ...row };
    },
  };
  const client: Record<string, unknown> = { staffUser };
  client.$transaction = (fn: (tx: unknown) => unknown) => fn(client);
  return { prisma: client };
});

let baseUrl = "";
let tokenFor: (id: string) => string;
let disconnectStaffSockets: (staffId: string, reason: string) => Promise<number>;
const open: Socket[] = [];

function addStaff(id: string, role: string, isActive = true) {
  db.staff.set(id, { id, name: id, username: id, role, kitchenId: null, isActive, employeeId: null });
}

function client(token: string): Socket {
  const socket = connect(baseUrl, { auth: { token }, transports: ["websocket"], reconnection: false, forceNew: true });
  open.push(socket);
  return socket;
}

const connected = (socket: Socket) =>
  new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });

const refused = (socket: Socket) =>
  new Promise<Error & { data?: { code?: string } }>((resolve, reject) => {
    socket.once("connect", () => reject(new Error("connected, expected a refusal")));
    socket.once("connect_error", resolve);
  });

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgresql://test";
  process.env.JWT_SECRET ??= "test-secret";
  process.env.PORT ??= "0";
  const { env } = await import("./env");
  const socketModule = await import("./socket");
  const { posRouter } = await import("../routes/pos.routes");
  disconnectStaffSockets = socketModule.disconnectStaffSockets;
  tokenFor = (id) => {
    const row = db.staff.get(id)!;
    return jwt.sign({ id, role: row.role, kitchenId: row.kitchenId }, env.JWT_SECRET, { expiresIn: "5m" });
  };

  const app = express();
  app.use(express.json());
  app.use("/api/pos", posRouter);
  const server = createServer(app);
  socketModule.initSocket(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  db.staff.clear();
});

afterAll(() => {
  open.forEach((socket) => socket.disconnect());
});

describe("socket handshake checks the account", () => {
  it("refuses an inactive account, with the AUTH code the POS logs out on", async () => {
    addStaff("kitchen-1", "KITCHEN");
    const token = tokenFor("kitchen-1");
    db.staff.get("kitchen-1")!.isActive = false;
    const error = await refused(client(token));
    expect(error.message).toBe("This account has been deactivated");
    expect(error.data).toEqual({ code: "AUTH" });
  });

  it("refuses a token whose role no longer matches the account", async () => {
    addStaff("admin-1", "POS_ADMIN");
    const token = tokenFor("admin-1");
    db.staff.get("admin-1")!.role = "KITCHEN";
    expect((await refused(client(token))).message).toBe("Your account was changed — please log in again");
  });

  it("refuses a bad token with the AUTH code too", async () => {
    const error = await refused(client("not-a-jwt"));
    expect(error.message).toBe("Invalid or expired token");
    expect(error.data).toEqual({ code: "AUTH" });
  });
});

describe("ending live sessions", () => {
  it("deactivating a connected user disconnects them at once (auth:revoked, then a server disconnect), and nobody else", async () => {
    addStaff("super-1", "SUPER_ADMIN");
    addStaff("kitchen-1", "KITCHEN");
    addStaff("kitchen-2", "KITCHEN");
    const victim = client(tokenFor("kitchen-1"));
    const bystander = client(tokenFor("kitchen-2"));
    await Promise.all([connected(victim), connected(bystander)]);

    const revoked = new Promise<unknown>((resolve) => victim.once("auth:revoked", resolve));
    const gone = new Promise<string>((resolve) => victim.once("disconnect", resolve));
    const response = await fetch(`${baseUrl}/api/pos/staff/kitchen-1`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenFor("super-1")}` },
    });

    expect(response.status).toBe(200);
    expect(await revoked).toEqual({ reason: "Account deleted" });
    expect(await gone).toBe("io server disconnect");
    expect(bystander.connected).toBe(true);
    // And it can't come back with the same (still unexpired) token.
    expect((await refused(client(tokenFor("kitchen-1")))).message).toBe("This account has been deactivated");
  });

  it("a role change ends the sessions; a name change does not", async () => {
    addStaff("super-1", "SUPER_ADMIN");
    addStaff("admin-1", "POS_ADMIN");
    const socket = client(tokenFor("admin-1"));
    await connected(socket);
    const put = (body: unknown) =>
      fetch(`${baseUrl}/api/pos/staff/admin-1`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${tokenFor("super-1")}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

    expect((await put({ name: "Renamed" })).status).toBe(200);
    expect(await disconnectStaffSockets("nobody", "x")).toBe(0);
    expect(socket.connected).toBe(true);

    const gone = new Promise<string>((resolve) => socket.once("disconnect", resolve));
    expect((await put({ role: "KITCHEN" })).status).toBe(200);
    expect(await gone).toBe("io server disconnect");
  });
});
