import "./loadEnv";
import { Prisma, PrismaClient } from "../../generated/prisma/client";

// Test helper for running real service code against the local database without leaving
// anything behind. A test file swaps config/prisma's `prisma` for `prismaProxy`:
//
//   vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
//
// and wraps each test in withRollback(). Every query the service makes then runs inside one
// interactive transaction that is ALWAYS rolled back; a service's own prisma.$transaction(fn)
// just runs fn inside it. Only for a local DATABASE_URL — callers skip otherwise
// (describe.skipIf(!isLocalDb)), so a test can never touch a remote database.

export const isLocalDb = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL ?? "");

const realClient = isLocalDb ? new PrismaClient() : undefined;
let currentTx: Prisma.TransactionClient | null = null;

function requireTx(): Prisma.TransactionClient {
  if (!currentTx) {
    throw new Error("testDb: query made outside withRollback()");
  }
  return currentTx;
}

export const prismaProxy = new Proxy(
  {},
  {
    get(_target, property) {
      if (property === "$transaction") {
        // Callback form runs inside the open transaction; array form's items were already
        // created against it, so awaiting them all is the same thing.
        return (arg: unknown) =>
          typeof arg === "function" ? (arg as (tx: Prisma.TransactionClient) => unknown)(requireTx()) : Promise.all(arg as Promise<unknown>[]);
      }
      return (requireTx() as unknown as Record<string | symbol, unknown>)[property];
    },
  },
);

class Rollback extends Error {}

export async function withRollback<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!realClient) {
    throw new Error("testDb: DATABASE_URL is not local");
  }
  let result: T | undefined;
  try {
    await realClient.$transaction(
      async (tx) => {
        currentTx = tx;
        try {
          result = await work(tx);
        } finally {
          currentTx = null;
        }
        throw new Rollback();
      },
      { timeout: 60_000, maxWait: 20_000 },
    );
  } catch (error) {
    if (error instanceof Rollback) {
      return result as T;
    }
    throw error;
  }
  throw new Error("testDb: transaction unexpectedly committed");
}

// A stand-in for Socket.io's server that records every emit, for vi.mock("../../config/socket").
export interface RecordedEmit {
  rooms: string[];
  event: string;
  payload: unknown;
}

export function createFakeIO() {
  const emits: RecordedEmit[] = [];
  const target = (rooms: string[]) => ({
    to: (room: string) => target([...rooms, room]),
    emit: (event: string, payload: unknown) => {
      emits.push({ rooms, event, payload });
      return true;
    },
  });
  return { io: { to: (room: string) => target([room]) }, emits };
}

// One recorder per test file, visible to both the socket mock and the test:
//   vi.mock("../../config/socket", async () => {
//     const { sharedFakeIO } = await import("../../common/testDb");
//     return { getIO: () => sharedFakeIO.io };
//   });
// then read (and reset with .length = 0) sharedFakeIO.emits in the test.
export const sharedFakeIO = createFakeIO();
