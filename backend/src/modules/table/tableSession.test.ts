import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, StaffRole } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as guestService from "../tableGuest/tableGuest.service";
import { seedTableWorld } from "../tableGuest/tableQrTestSeed";
import * as sessionService from "./tableSession.service";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

beforeEach(() => {
  sharedFakeIO.emits.length = 0;
});

const refusal = (error: unknown) =>
  error instanceof guestService.TableGuestError ? { status: error.status, code: error.code } : error;

describe.skipIf(!isLocalDb)("table sessions (local DB, rolled back)", () => {
  it("seats once (a second seat is TABLE_OCCUPIED) and needs an active business day", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const actor = { id: world.posAdmin.id, role: StaffRole.POS_ADMIN };
      const first = await sessionService.seatTable(world.table.id, actor);
      const second = await sessionService.seatTable(world.table.id, actor).catch((e) => e);
      await tx.businessDay.updateMany({ where: { isActive: true }, data: { isActive: false } });
      const other = await tx.diningArea.create({ data: { name: "No-day table", type: "TABLE" } });
      const noDay = await sessionService.seatTable(other.id, actor).catch((e) => e);
      return { first, second, noDay };
    });
    expect(result.first.pin).toBeNull();
    expect(result.second).toMatchObject({ status: 409, code: "TABLE_OCCUPIED", extra: { sessionId: result.first.session.id } });
    expect(result.noDay).toMatchObject({ status: 409, code: "NO_BUSINESS_DAY" });
    expect(sharedFakeIO.emits.some((emit) => emit.event === "table-session:updated")).toBe(true);
  });

  // The rule holds in the database itself, not only in seatTable's pre-check: a second OPEN session for
  // the same table (what two simultaneous "seat" taps would insert) violates the partial unique index.
  // It is the last statement in this test because the violation aborts the test's transaction.
  it("enforces one OPEN session per table in the database (partial unique index)", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const actor = { id: world.posAdmin.id, role: StaffRole.POS_ADMIN };
      const seated = await sessionService.seatTable(world.table.id, actor);
      // A CLOSED one alongside is fine — the index only covers OPEN.
      await tx.tableSession.create({
        data: { diningAreaId: world.table.id, businessDayId: world.activeDay.id, seatedById: world.posAdmin.id, status: "CLOSED" },
      });
      const duplicate = await tx.tableSession
        .create({ data: { diningAreaId: world.table.id, businessDayId: world.activeDay.id, seatedById: world.posAdmin.id } })
        .catch((e) => e);
      return { seated, duplicate };
    });
    expect(result.seated.session.id).toBeTruthy();
    expect(result.duplicate).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect((result.duplicate as Prisma.PrismaClientKnownRequestError).code).toBe("P2002");
  });

  it("regenerating a table's qrKey kills the old QR: lookups and joins with it are NOT_FOUND", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const oldKey = world.table.qrKey as string;
      const { qrKey: newKey } = await sessionService.regenerateQrKey(world.table.id);
      const join = (qrKey: string) =>
        guestService
          .joinTable(qrKey, { displayName: "Ali", pin: undefined, joinRequestId: crypto.randomUUID() }, "10.0.0.3")
          .catch(refusal);
      return {
        oldKey,
        newKey,
        oldLookup: await guestService.getTableByQrKey(oldKey).catch(refusal),
        oldJoin: await join(oldKey),
        newLookup: await guestService.getTableByQrKey(newKey),
        newJoin: await join(newKey),
        unknown: await sessionService.regenerateQrKey("no-such-table").catch((e) => e),
      };
    });
    expect(result.newKey).not.toBe(result.oldKey);
    expect(result.newKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(result.oldLookup).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(result.oldJoin).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(result.newLookup).toMatchObject({ state: "OPEN" });
    expect(result.newJoin).toMatchObject({ isNew: true });
    expect(result.unknown).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("the QR sheet hands out a key for every active table, generating missing ones", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const bare = await tx.diningArea.create({ data: { name: "Keyless", type: "TABLE", area: "Rooftop" } });
      const sheet = await sessionService.getQrSheet("Rooftop");
      return { bare, sheet, stored: await tx.diningArea.findUniqueOrThrow({ where: { id: bare.id } }), world };
    });
    expect(result.bare.qrKey).toBeNull();
    expect(result.sheet.tables).toEqual([{ id: result.bare.id, name: "Keyless", area: "Rooftop", qrKey: result.stored.qrKey }]);
    expect(result.stored.qrKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});
