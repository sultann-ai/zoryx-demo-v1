import { Server, Socket } from "socket.io";
import type { Server as HttpServer } from "http";
import { createHash, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";
import { StaffRole } from "../../generated/prisma/client";
import { STAFF_SESSION_MESSAGE, asStaffClaims, checkStaffSession } from "../common/staffSession";
import { env, isOriginAllowed } from "./env";

export interface SocketStaff {
  id: string;
  role: StaffRole;
  kitchenId: string | null;
}

declare module "socket.io" {
  interface Socket {
    staff?: SocketStaff;
    // Set only on a print-agent connection (see the io.use branch below) — a socket has
    // either `staff` or `printerId`, never both.
    printerId?: string;
  }
}

let io: Server | undefined;

// A handshake refused because of who the token belongs to (bad/expired token, deactivated or
// changed account) carries data.code "AUTH", so the client logs out exactly as on an HTTP 401. Any
// other refusal (e.g. the database was unreachable) has no code: the client just retries.
function authError(message: string): Error {
  const error = new Error(message) as Error & { data?: { code: string } };
  error.data = { code: "AUTH" };
  return error;
}

// Ends every live socket of one staff member at once — called when they are deactivated, deleted,
// change role or kitchen, or have their password reset. Each gets "auth:revoked" first (the client
// logs out on it), then a server-side disconnect; a reconnect would be refused by the handshake.
export async function disconnectStaffSockets(staffId: string, reason: string): Promise<number> {
  if (!io) {
    return 0;
  }
  const sockets = await io.fetchSockets();
  let count = 0;
  for (const socket of sockets) {
    if (socket.data.staffId === staffId) {
      socket.emit("auth:revoked", { reason });
      socket.disconnect();
      count += 1;
    }
  }
  return count;
}

function canJoinRoom(staff: SocketStaff, room: string): boolean {
  if (staff.role === StaffRole.SUPER_ADMIN || staff.role === StaffRole.POS_ADMIN) {
    return room === "pos-admin" || room.startsWith("kitchen:");
  }
  if (staff.role === StaffRole.KITCHEN) {
    return room === `kitchen:${staff.kitchenId}`;
  }
  // Listen-only (rooms only ever receive server emits): lets an online admin's Incoming Orders
  // screen update live. Kitchen rooms stay closed to it.
  if (staff.role === StaffRole.ONLINE_ADMIN) {
    return room === "pos-admin";
  }
  return false;
}

// Hashing before timingSafeEqual sidesteps its throw-on-length-mismatch behavior (comparing
// two differently-sized buffers throws instead of returning false) while still removing the
// input-length timing signal — the standard way to constant-time-compare two arbitrary strings.
function constantTimeEqual(a: string, b: string): boolean {
  const bufA = createHash("sha256").update(a).digest();
  const bufB = createHash("sha256").update(b).digest();
  return timingSafeEqual(bufA, bufB);
}

// One live agent socket per printerId. Populated/cleared in the connection handler below, read
// by backend/src/modules/print to dispatch jobs directly to the right socket (never a room
// broadcast — there's always at most one member).
const printAgents = new Map<string, Socket>();

export function registerPrintAgent(printerId: string, socket: Socket): void {
  printAgents.set(printerId, socket);
}

// Identity-checked: only clears the slot if `socket` is still the one registered for
// `printerId`. Without this, a losing socket from the brief TOCTOU window between the io.use
// check and this handler firing (see the connection handler) could wipe out a newer, currently-
// active socket's registration when it eventually disconnects.
export function unregisterPrintAgent(printerId: string, socket: Socket): void {
  if (printAgents.get(printerId) === socket) {
    printAgents.delete(printerId);
  }
}

export function getPrintAgentSocket(printerId: string): Socket | undefined {
  return printAgents.get(printerId);
}

export function isPrinterOnline(printerId: string): boolean {
  return printAgents.get(printerId)?.connected === true;
}

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    },
  });

  io.use(async (socket, next) => {
    const { token, agentKey, printerId } = socket.handshake.auth ?? {};

    if (typeof agentKey === "string" && typeof printerId === "string") {
      if (!env.PRINT_AGENT_KEY) {
        next(new Error("Print agents are not enabled"));
        return;
      }
      if (!constantTimeEqual(agentKey, env.PRINT_AGENT_KEY)) {
        next(new Error("Invalid agent key"));
        return;
      }
      // Evict-and-replace rather than reject: Engine.io's ping timeout (~45s) can leave a
      // killed agent process looking `.connected === true` for a while, and a cashier
      // restarting the agent during that window shouldn't be locked out of printing.
      const existing = printAgents.get(printerId);
      if (existing) {
        existing.disconnect(true);
      }
      socket.printerId = printerId;
      next();
      return;
    }

    if (typeof token !== "string") {
      next(authError("Missing auth token"));
      return;
    }
    let payload: Record<string, unknown>;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as Record<string, unknown>;
    } catch {
      next(authError("Invalid or expired token"));
      return;
    }
    const claims = asStaffClaims(payload);
    if (!claims) {
      next(authError("Invalid token: not a staff token"));
      return;
    }
    // Same account check as HTTP (requireAuth): exists, active, same role and kitchen as the token.
    try {
      const problem = await checkStaffSession(claims);
      if (problem) {
        next(authError(STAFF_SESSION_MESSAGE[problem]));
        return;
      }
    } catch {
      next(new Error("Could not verify the staff account"));
      return;
    }
    socket.staff = claims;
    // What disconnectStaffSockets matches on (fetchSockets only exposes socket.data).
    socket.data.staffId = claims.id;
    next();
  });

  io.on("connection", (socket) => {
    if (socket.printerId !== undefined) {
      const printerId = socket.printerId;
      registerPrintAgent(printerId, socket);
      // Not used for dispatch (that targets this socket directly) — kept for any future
      // admin-visibility tooling that wants to see connected printers via rooms.
      socket.join(`printer:${printerId}`);
      console.log(`Print agent connected: ${printerId}`);

      socket.on("disconnect", () => {
        unregisterPrintAgent(printerId, socket);
        console.log(`Print agent disconnected: ${printerId}`);
      });
      // An agent socket is structurally incapable of joining any other room — it never
      // reaches the "join" handler below, not just permission-checked out of it.
      return;
    }

    console.log(`Socket connected: ${socket.id} (staff ${socket.staff?.id})`);

    // Server-initiated, not client-requested — an ORDER_TAKER socket can't reach this room
    // (or any other) through the "join" handler below, since canJoinRoom denies it for
    // every room by its default-deny fallthrough. This is the one room it's ever in.
    if (socket.staff && socket.staff.role === StaffRole.ORDER_TAKER) {
      socket.join(`user:${socket.staff.id}`);
    }

    socket.on("join", (room: unknown, ack?: (result: { ok: boolean; error?: string }) => void) => {
      if (typeof room !== "string" || !socket.staff) {
        ack?.({ ok: false, error: "Invalid room or not authenticated" });
        return;
      }
      if (!canJoinRoom(socket.staff, room)) {
        ack?.({ ok: false, error: "Forbidden: cannot join this room" });
        return;
      }
      socket.join(room);
      ack?.({ ok: true });
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) {
    throw new Error("Socket.io has not been initialized. Call initSocket() first.");
  }
  return io;
}
