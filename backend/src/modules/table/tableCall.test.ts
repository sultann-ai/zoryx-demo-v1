import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, StaffRole } from "../../../generated/prisma/client";
import { isLocalDb, sharedFakeIO, withRollback } from "../../common/testDb";
import * as guestService from "../tableGuest/tableGuest.service";
import { parseTableCallBody } from "../tableGuest/tableGuest.validators";
import { seedTableWorld } from "../tableGuest/tableQrTestSeed";
import * as callService from "./tableCall.service";
import * as sessionService from "./tableSession.service";

vi.mock("../../config/prisma", async () => ({ prisma: (await import("../../common/testDb")).prismaProxy }));
vi.mock("../../config/socket", async () => {
  const { sharedFakeIO: fake } = await import("../../common/testDb");
  return { getIO: () => fake.io };
});

beforeEach(() => {
  sharedFakeIO.emits.length = 0;
});

type World = Awaited<ReturnType<typeof seedTableWorld>>;

const call = (type: string, note?: string) =>
  parseTableCallBody({ clientRequestId: crypto.randomUUID(), type, ...(note !== undefined ? { note } : {}) });

const refusal = (error: unknown) =>
  error instanceof guestService.TableGuestError ? { status: error.status, code: error.code, ...error.extra } : error;

// Seat the table (as an order taker: they become its waiter; as a POS admin: no waiter) and join guests.
async function seatAndJoin(world: World, options: { seatAs: "ORDER_TAKER" | "POS_ADMIN"; guests: string[] }) {
  const actor =
    options.seatAs === "ORDER_TAKER"
      ? { id: world.waiter.id, role: StaffRole.ORDER_TAKER }
      : { id: world.posAdmin.id, role: StaffRole.POS_ADMIN };
  const seated = await sessionService.seatTable(world.table.id, actor);
  const guests = [];
  for (const name of options.guests) {
    const { result } = await guestService.joinTable(
      world.table.qrKey as string,
      { displayName: name, pin: undefined, joinRequestId: crypto.randomUUID() },
      "10.0.0.7",
    );
    guests.push((await guestService.authenticateGuest(result.token))!);
  }
  return { sessionId: seated.session.id, guests };
}

// Moves calls back in time: past a guest's 60 s cooldown, or past the 2-minute escalation mark.
const age = (tx: Prisma.TransactionClient, where: Prisma.TableCallWhereInput, ms: number) =>
  tx.tableCall.updateMany({ where, data: { createdAt: new Date(Date.now() - ms) } });

const raisedEmits = () => sharedFakeIO.emits.filter((emit) => emit.event === "table-call:raised");

describe.skipIf(!isLocalDb)("waiter calls (local DB, rolled back)", () => {
  it("a guest's second call within 60 s is refused with the seconds to wait; after that it goes through", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, { seatAs: "POS_ADMIN", guests: ["Ali", "Sara"] });
      const first = await guestService.createTableCall(guests[0]!, call("WATER"));
      const tooSoon = await guestService.createTableCall(guests[0]!, call("NAPKINS")).catch(refusal);
      // The cooldown is per guest: Sara can call right away.
      const otherGuest = await guestService.createTableCall(guests[1]!, call("NAPKINS"));
      await age(tx, { guestId: guests[0]!.id }, 61_000);
      const afterCooldown = await guestService.createTableCall(guests[0]!, call("NAPKINS"));
      const poll = await guestService.getSessionPoll(guests[0]!);
      return { first, tooSoon, otherGuest, afterCooldown, poll };
    });
    expect(result.first).toMatchObject({ isNew: true, result: { type: "WATER", status: "RAISED" } });
    expect(result.tooSoon).toMatchObject({ status: 429, code: "COOLDOWN" });
    const wait = (result.tooSoon as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(wait).toBeGreaterThan(0);
    expect(wait).toBeLessThanOrEqual(60);
    expect(result.otherGuest.isNew).toBe(true);
    expect(result.afterCooldown.isNew).toBe(true);
    // The guest's poll shows their calls and the fresh cooldown.
    expect(result.poll.myCalls.map((c) => c.type)).toEqual(["NAPKINS", "WATER"]);
    expect(result.poll.cooldowns.callSeconds).toBeGreaterThan(0);
  });

  it("caps open calls at 3 per session; a resolved or withdrawn call frees a slot", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, { seatAs: "POS_ADMIN", guests: ["Ali", "Sara", "Omar", "Zara"] });
      const opened = [];
      for (const guest of guests.slice(0, 3)) {
        opened.push((await guestService.createTableCall(guest, call("WATER"))).result);
      }
      const fourth = await guestService.createTableCall(guests[3]!, call("WATER")).catch(refusal);
      await callService.acknowledgeCall(opened[0]!.id, world.posAdmin.id);
      const stillFull = await guestService.createTableCall(guests[3]!, call("WATER")).catch(refusal);
      await callService.resolveCall(opened[0]!.id, world.posAdmin.id);
      const afterResolve = await guestService.createTableCall(guests[3]!, call("OTHER", "High chair please"));
      await guestService.cancelOwnCall(guests[1]!, opened[1]!.id);
      await age(tx, { guestId: guests[0]!.id }, 61_000);
      const afterWithdraw = await guestService.createTableCall(guests[0]!, call("WATER"));
      return { fourth, stillFull, afterResolve, afterWithdraw };
    });
    expect(result.fourth).toMatchObject({ status: 429, code: "TOO_MANY" });
    // Acknowledged is still open: it still counts toward the cap.
    expect(result.stillFull).toMatchObject({ status: 429, code: "TOO_MANY" });
    expect(result.afterResolve).toMatchObject({ isNew: true, result: { type: "OTHER", note: "High chair please" } });
    expect(result.afterWithdraw.isNew).toBe(true);
  });

  it("routes to the table's waiter (their user room + pos-admin), else to every order taker + pos-admin", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      // Seated by the order taker: they are the session's waiter.
      const routed = await seatAndJoin(world, { seatAs: "ORDER_TAKER", guests: ["Ali"] });
      sharedFakeIO.emits.length = 0;
      const toWaiter = await guestService.createTableCall(routed.guests[0]!, call("WATER"));
      const toWaiterEmits = raisedEmits();

      // The waiter is deactivated mid-shift: the next call broadcasts instead of going to a dead login.
      await tx.staffUser.update({ where: { id: world.waiter.id }, data: { isActive: false } });
      await age(tx, { guestId: routed.guests[0]!.id }, 61_000);
      sharedFakeIO.emits.length = 0;
      const afterDeactivate = await guestService.createTableCall(routed.guests[0]!, call("NAPKINS"));
      const afterDeactivateEmits = raisedEmits();

      // A table seated by reception with no default waiter: broadcast from the start.
      const other = await tx.diningArea.create({ data: { name: "Unassigned", type: "TABLE", qrKey: "unassignedtableqrkey12" } });
      await sessionService.seatTable(other.id, { id: world.posAdmin.id, role: StaffRole.POS_ADMIN });
      const { result: joined } = await guestService.joinTable(
        "unassignedtableqrkey12",
        { displayName: "Sara", pin: undefined, joinRequestId: crypto.randomUUID() },
        "10.0.0.8",
      );
      sharedFakeIO.emits.length = 0;
      const unassigned = await guestService.createTableCall((await guestService.authenticateGuest(joined.token))!, call("BILL_CASH"));
      const unassignedEmits = raisedEmits();

      const rows = await tx.tableCall.findMany({
        where: { id: { in: [toWaiter.result.id, afterDeactivate.result.id, unassigned.result.id] } },
        select: { id: true, routedToStaffId: true },
      });
      return { world, toWaiter, toWaiterEmits, afterDeactivate, afterDeactivateEmits, unassigned, unassignedEmits, rows };
    });
    const routedTo = (id: string) => result.rows.find((row) => row.id === id)?.routedToStaffId;

    expect(routedTo(result.toWaiter.result.id)).toBe(result.world.waiter.id);
    expect(result.toWaiterEmits).toEqual([
      expect.objectContaining({
        rooms: [`user:${result.world.waiter.id}`, "pos-admin"],
        payload: expect.objectContaining({ type: "WATER", guestName: "Ali", routedToStaffId: result.world.waiter.id }),
      }),
    ]);
    expect(routedTo(result.afterDeactivate.result.id)).toBeNull();
    expect(result.afterDeactivateEmits).toEqual([expect.objectContaining({ rooms: ["order-takers", "pos-admin"] })]);
    expect(routedTo(result.unassigned.result.id)).toBeNull();
    expect(result.unassignedEmits).toEqual([expect.objectContaining({ rooms: ["order-takers", "pos-admin"] })]);
    // An open BILL_CASH call is what shows BILL_REQUESTED on the floor map in phase 1.
    expect(
      sharedFakeIO.emits.some(
        (emit) => emit.event === "table:updated" && (emit.payload as { state: string; attention: string }).state === "BILL_REQUESTED",
      ),
    ).toBe(true);
  });

  it("escalates a call nobody acknowledged within 2 minutes — once — and leaves the rest alone", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, { seatAs: "ORDER_TAKER", guests: ["Ali", "Sara", "Omar"] });
      const stale = (await guestService.createTableCall(guests[0]!, call("WATER"))).result;
      const staleButAcked = (await guestService.createTableCall(guests[1]!, call("NAPKINS"))).result;
      const fresh = (await guestService.createTableCall(guests[2]!, call("WATER"))).result;
      await callService.acknowledgeCall(staleButAcked.id, world.waiter.id);
      await age(tx, { id: { in: [stale.id, staleButAcked.id] } }, 3 * 60_000);
      // Just under two minutes old: not yet.
      await age(tx, { id: fresh.id }, 119_000);

      sharedFakeIO.emits.length = 0;
      const now = new Date();
      const firstPass = await callService.escalateDueCalls(now);
      const escalatedEmits = sharedFakeIO.emits.filter((emit) => emit.event === "table-call:escalated");
      const secondPass = await callService.escalateDueCalls(new Date());
      const rows = await tx.tableCall.findMany({
        where: { id: { in: [stale.id, staleButAcked.id, fresh.id] } },
        select: { id: true, escalatedAt: true, status: true },
      });
      const floor = (await sessionService.getFloor()).tables.find((table) => table.id === world.table.id);
      const openList = await callService.listCalls({ status: "open" });
      return { stale, staleButAcked, fresh, firstPass, escalatedEmits, secondPass, rows, floor, openList, now };
    });
    const row = (id: string) => result.rows.find((r) => r.id === id)!;

    expect(result.firstPass.map((c) => c.id)).toEqual([result.stale.id]);
    expect(row(result.stale.id).escalatedAt).toEqual(result.now);
    expect(row(result.stale.id).status).toBe("RAISED");
    expect(row(result.staleButAcked.id).escalatedAt).toBeNull();
    expect(row(result.fresh.id).escalatedAt).toBeNull();
    expect(result.escalatedEmits).toEqual([
      expect.objectContaining({ rooms: ["pos-admin"], payload: expect.objectContaining({ callId: result.stale.id, type: "WATER" }) }),
    ]);
    // Exactly once: the next pass finds nothing to do.
    expect(result.secondPass).toEqual([]);
    expect(result.floor?.attention).toBe("ESCALATED");
    expect(result.floor?.session?.openCalls.find((c) => c.id === result.stale.id)?.escalated).toBe(true);
    expect(result.openList.find((c) => c.id === result.stale.id)?.escalatedAt).toEqual(result.now);
  });

  it("acknowledge and resolve are one-way and race-safe; a closed table cancels its open calls", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { sessionId, guests } = await seatAndJoin(world, { seatAs: "ORDER_TAKER", guests: ["Ali", "Sara"] });
      const a = (await guestService.createTableCall(guests[0]!, call("WATER"))).result;
      const b = (await guestService.createTableCall(guests[1]!, call("NAPKINS"))).result;
      const acked = await callService.acknowledgeCall(a.id, world.waiter.id);
      const ackAgain = await callService.acknowledgeCall(a.id, world.posAdmin.id).catch((e) => e);
      const resolved = await callService.resolveCall(a.id, world.posAdmin.id);
      const resolveAgain = await callService.resolveCall(a.id, world.posAdmin.id).catch((e) => e);
      const unknown = await callService.acknowledgeCall("no-such-call", world.posAdmin.id).catch((e) => e);
      sharedFakeIO.emits.length = 0;
      await sessionService.closeSession(sessionId, world.waiter.id);
      const bAfterClose = await tx.tableCall.findUniqueOrThrow({ where: { id: b.id } });
      return { acked, ackAgain, resolved, resolveAgain, unknown, bAfterClose };
    });
    expect(result.acked).toMatchObject({ status: "ACKNOWLEDGED", acknowledgedBy: { name: "Wasim Waiter" } });
    expect(result.ackAgain).toMatchObject({ status: 409, code: "NOT_OPEN" });
    expect(result.resolved).toMatchObject({ status: "RESOLVED" });
    expect(result.resolveAgain).toMatchObject({ status: 409, code: "NOT_OPEN" });
    expect(result.unknown).toMatchObject({ status: 404, code: "NOT_FOUND" });
    expect(result.bAfterClose.status).toBe("CANCELLED");
    expect(sharedFakeIO.emits.some((emit) => emit.event === "table-call:updated" && (emit.payload as { status: string }).status === "CANCELLED")).toBe(true);
  });

  it("a resent call (same clientRequestId) is created once; another guest reusing the id gets 409", async () => {
    const result = await withRollback(async (tx) => {
      const world = await seedTableWorld(tx);
      const { guests } = await seatAndJoin(world, { seatAs: "POS_ADMIN", guests: ["Ali", "Sara"] });
      const body = call("WATER");
      const first = await guestService.createTableCall(guests[0]!, body);
      const again = await guestService.createTableCall(guests[0]!, body);
      const stolen = await guestService.createTableCall(guests[1]!, body).catch(refusal);
      return { first, again, stolen, count: await tx.tableCall.count({ where: { clientRequestId: body.clientRequestId } }) };
    });
    expect(result.again).toEqual({ result: result.first.result, isNew: false });
    expect(result.stolen).toMatchObject({ status: 409, code: "REQUEST_ID_REUSED" });
    expect(result.count).toBe(1);
  });
});
