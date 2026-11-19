import { beforeEach, describe, expect, it, vi } from "vitest";
import { StaffRole } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as sessionService from "../table/tableSession.service";
import { hashGuestToken } from "./guestToken";
import * as guestService from "./tableGuest.service";
import { seedTableWorld } from "./tableQrTestSeed";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

beforeEach(() => {
  sharedFakeIO.emits.length = 0;
});

const refusal = (error: unknown) =>
  error instanceof guestService.TableGuestError ? { status: error.status, code: error.code, ...error.extra } : error;

const joinInput = (pin?: string) => ({ displayName: "Ali", pin, joinRequestId: crypto.randomUUID() });

describe.skipIf(!isLocalDb)("guest join and the guest token (local DB, rolled back)", () => {
  it("stores only the token's hash, and the token is dead once the table is closed", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const seated = await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const { result: joined } = await guestService.joinTable(world.table.qrKey as string, joinInput(), "10.0.0.4");
      const row = await tx.tableGuest.findUniqueOrThrow({ where: { id: joined.guest.id } });
      const beforeClose = await guestService.authenticateGuest(joined.token);
      await sessionService.closeSession(seated.session.id, world.posAdmin.id);
      const afterClose = await guestService.authenticateGuest(joined.token);
      const rejoin = await guestService.joinTable(world.table.qrKey as string, joinInput(), "10.0.0.4").catch(refusal);
      return { joined, row, beforeClose, afterClose, rejoin };
    });
    expect(result.joined.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.row.tokenHash).toBe(hashGuestToken(result.joined.token));
    expect(result.row.tokenHash).not.toContain(result.joined.token);
    expect(JSON.stringify(result.row)).not.toContain(result.joined.token);
    expect(result.beforeClose).toMatchObject({ id: result.joined.guest.id });
    expect(result.afterClose).toBeNull();
    // The table is closed now: joining again is refused too, until staff seat it again.
    expect(result.rejoin).toMatchObject({ status: 409, code: "TABLE_CLOSED" });
  });

  it("rejects a join on a table nobody has seated, and when no business day is active", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const qrKey = world.table.qrKey as string;
      const unseated = await guestService.joinTable(qrKey, joinInput(), "10.0.0.5").catch(refusal);
      const landingUnseated = await guestService.getTableByQrKey(qrKey);
      await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      await tx.businessDay.updateMany({ where: { isActive: true }, data: { isActive: false } });
      const noDay = await guestService.joinTable(qrKey, joinInput(), "10.0.0.5").catch(refusal);
      const landingNoDay = await guestService.getTableByQrKey(qrKey);
      return { unseated, landingUnseated, noDay, landingNoDay, guests: await tx.tableGuest.count({ where: { session: { diningAreaId: world.table.id } } }) };
    });
    expect(result.unseated).toMatchObject({ status: 409, code: "TABLE_CLOSED" });
    // The landing page still shows the menu read-only, with the reason.
    expect(result.landingUnseated).toMatchObject({ state: "CLOSED", orderingOpen: false, closedReason: "not_seated" });
    expect(result.noDay).toMatchObject({ status: 409, code: "ORDERING_CLOSED" });
    expect(result.landingNoDay).toMatchObject({ state: "OPEN", orderingOpen: false, closedReason: "no_business_day" });
    expect(result.guests).toBe(0);
  });

  it("checks the PIN, counts wrong tries, and rotates it after 10", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx, { requirePin: true });
      const qrKey = world.table.qrKey as string;
      const join = (pin?: string) => guestService.joinTable(qrKey, joinInput(pin), "10.0.0.9").catch(refusal);
      const seated = await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const wrongPin = seated.pin === "0000" ? "1111" : "0000";
      const noPin = await join(undefined);
      for (let i = 0; i < 8; i += 1) {
        await join(wrongPin);
      }
      const locked = await join(wrongPin);
      const oldPinNow = await join(seated.pin as string);
      const newPin = (await tx.tableSession.findUniqueOrThrow({ where: { id: seated.session.id } })).joinPin as string;
      const joined = (await guestService.joinTable(qrKey, joinInput(newPin), "10.0.0.9")).result;
      const landing = await guestService.getTableByQrKey(qrKey);
      return { seated, noPin, locked, oldPinNow, newPin, joined, landing };
    });
    expect(result.seated.pin).toMatch(/^\d{4}$/);
    expect(result.noPin).toMatchObject({ status: 400, code: "BAD_PIN", attemptsLeft: 9 });
    expect(result.locked).toMatchObject({ status: 423, code: "PIN_LOCKED" });
    expect(result.newPin).not.toBe(result.seated.pin);
    expect(result.oldPinNow).toMatchObject({ status: 400, code: "BAD_PIN" });
    expect(result.joined.guest.displayName).toBe("Ali");
    expect(result.landing).toMatchObject({ state: "OPEN", requiresPin: true, orderingOpen: true });
    expect(JSON.stringify(result.landing)).not.toContain(result.newPin);
    expect(sharedFakeIO.emits.some((emit) => emit.event === "table-session:pin-locked")).toBe(true);
  });

  it("a replayed join returns the same guest with a fresh token; a removed guest's token stops working", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const seated = await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const input = joinInput();
      const first = await guestService.joinTable(world.table.qrKey as string, input, "10.0.0.2");
      const replay = await guestService.joinTable(world.table.qrKey as string, input, "10.0.0.2");
      const oldTokenAfterReplay = await guestService.authenticateGuest(first.result.token);
      const guest = await guestService.authenticateGuest(replay.result.token);
      await sessionService.removeGuest(seated.session.id, guest!.id, world.posAdmin.id, "Not at this table");
      return { first, replay, oldTokenAfterReplay, afterRemove: await guestService.authenticateGuest(replay.result.token) };
    });
    expect(result.first.isNew).toBe(true);
    expect(result.replay.isNew).toBe(false);
    expect(result.replay.result.guest.id).toBe(result.first.result.guest.id);
    expect(result.oldTokenAfterReplay).toBeNull();
    expect(result.afterRemove).toBeNull();
  });

  it("caps active guests per session at 20", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      await sessionService.seatTable(world.table.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      for (let i = 0; i < 20; i += 1) {
        await guestService.joinTable(world.table.qrKey as string, joinInput(), `10.0.1.${i}`);
      }
      return guestService.joinTable(world.table.qrKey as string, joinInput(), "10.0.1.99").catch(refusal);
    });
    expect(result).toMatchObject({ status: 409, code: "SESSION_FULL" });
  });
});
