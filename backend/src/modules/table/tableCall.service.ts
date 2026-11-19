import { Prisma, StaffRole, TableCallStatus } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { getIO } from "../../config/socket";
import { emitTableUpdated, touchTableSession } from "./tableNotify";
import { TableStaffError } from "./tableErrors";

// Waiter calls (docs/TABLE_QR_SPEC.md §3.4, §5.4): routing, the staff actions, and the escalation pass.
// Guests raise and withdraw calls through tableGuest.service; everything a call does to staff screens
// happens here.

export const OPEN_CALL_STATUSES: TableCallStatus[] = [TableCallStatus.RAISED, TableCallStatus.ACKNOWLEDGED];

// A call nobody acknowledged within this long is escalated to reception (once).
export const CALL_ESCALATION_AFTER_MS = 2 * 60 * 1000;

type Db = Prisma.TransactionClient | typeof prisma;

// Who may receive a table's calls: an active login that works the floor (same rule as a table's waiter).
const CALL_TARGET_ROLES: StaffRole[] = [StaffRole.ORDER_TAKER, StaffRole.POS_ADMIN, StaffRole.SUPER_ADMIN];

// The session's waiter if that login can still take calls (active, a floor role); otherwise null, which
// means "broadcast". Re-checked at raise time, so a deactivated or re-roled waiter never swallows a call.
export async function resolveCallTarget(db: Db, waiterStaffId: string | null): Promise<string | null> {
  if (!waiterStaffId) {
    return null;
  }
  const staff = await db.staffUser.findUnique({ where: { id: waiterStaffId }, select: { isActive: true, role: true } });
  return staff && staff.isActive && CALL_TARGET_ROLES.includes(staff.role) ? waiterStaffId : null;
}

// A routed call goes to its waiter's personal room and to reception; an unrouted one to every order
// taker and reception. (pos-admin always hears it, so reception can step in.)
export function callRooms(routedToStaffId: string | null): string[] {
  return routedToStaffId ? [`user:${routedToStaffId}`, "pos-admin"] : ["order-takers", "pos-admin"];
}

function emitSafely(emit: () => void): void {
  try {
    emit();
  } catch {
    // No Socket.io in this process — nothing to notify.
  }
}

function emitToRooms(rooms: string[], event: string, payload: unknown): void {
  emitSafely(() => {
    let target = getIO().to(rooms[0] as string);
    for (const room of rooms.slice(1)) {
      target = target.to(room);
    }
    target.emit(event, payload);
  });
}

export const callInclude = {
  diningArea: { select: { id: true, name: true, area: true } },
  guest: { select: { displayName: true } },
  routedToStaff: { select: { id: true, name: true } },
  acknowledgedBy: { select: { id: true, name: true } },
  resolvedBy: { select: { id: true, name: true } },
} satisfies Prisma.TableCallInclude;

type CallWithDetails = Prisma.TableCallGetPayload<{ include: typeof callInclude }>;

// What staff screens get for a call (list and socket payloads share it).
export function toStaffCall(call: CallWithDetails) {
  return {
    id: call.id,
    sessionId: call.sessionId,
    type: call.type,
    note: call.note,
    status: call.status,
    createdAt: call.createdAt,
    escalatedAt: call.escalatedAt,
    table: call.diningArea,
    guestName: call.guest?.displayName ?? null,
    routedTo: call.routedToStaff,
    acknowledgedBy: call.acknowledgedBy,
    acknowledgedAt: call.acknowledgedAt,
    resolvedBy: call.resolvedBy,
    resolvedAt: call.resolvedAt,
  };
}

export async function emitCallRaised(call: CallWithDetails): Promise<void> {
  emitToRooms(callRooms(call.routedToStaffId), "table-call:raised", {
    callId: call.id,
    sessionId: call.sessionId,
    diningAreaId: call.diningAreaId,
    tableName: call.diningArea.name,
    area: call.diningArea.area,
    type: call.type,
    note: call.note,
    guestName: call.guest?.displayName ?? null,
    createdAt: call.createdAt,
    routedToStaffId: call.routedToStaffId,
  });
  await emitTableUpdated(call.diningAreaId);
}

export async function emitCallUpdated(
  call: { id: string; diningAreaId: string; status: TableCallStatus; routedToStaffId: string | null },
  byName: string | null,
  options: { refreshTable?: boolean } = {},
): Promise<void> {
  emitToRooms(callRooms(call.routedToStaffId), "table-call:updated", {
    callId: call.id,
    diningAreaId: call.diningAreaId,
    status: call.status,
    byName,
  });
  if (options.refreshTable !== false) {
    await emitTableUpdated(call.diningAreaId);
  }
}

// ================= Staff: list, acknowledge, resolve =================

export async function listCalls(filter: { status: "open" | "all"; since?: Date }) {
  const calls = await prisma.tableCall.findMany({
    where:
      filter.status === "open"
        ? { status: { in: OPEN_CALL_STATUSES } }
        : { ...(filter.since !== undefined ? { createdAt: { gte: filter.since } } : {}) },
    include: callInclude,
    orderBy: { createdAt: "asc" },
    ...(filter.status === "all" ? { take: 500 } : {}),
  });
  return calls.map(toStaffCall);
}

const callNotFound = () => new TableStaffError(404, "NOT_FOUND", "Call not found");
const callNotOpen = () => new TableStaffError(409, "NOT_OPEN", "This call has already been dealt with");

// Conditional on the call still being in one of `from`, so two staff tapping at once can't both win.
async function transitionCall(
  callId: string,
  from: TableCallStatus[],
  data: Prisma.TableCallUncheckedUpdateManyInput,
  actorId: string,
) {
  const existing = await prisma.tableCall.findUnique({ where: { id: callId }, select: { id: true } });
  if (!existing) {
    throw callNotFound();
  }
  const call = await prisma.$transaction(async (tx) => {
    const result = await tx.tableCall.updateMany({ where: { id: callId, status: { in: from } }, data });
    if (result.count === 0) {
      throw callNotOpen();
    }
    const updated = await tx.tableCall.findUniqueOrThrow({ where: { id: callId }, include: callInclude });
    await touchTableSession(tx, updated.sessionId);
    return updated;
  });
  const actor = await prisma.staffUser.findUnique({ where: { id: actorId }, select: { name: true } });
  await emitCallUpdated(call, actor?.name ?? null);
  return toStaffCall(call);
}

// "On my way."
export function acknowledgeCall(callId: string, actorId: string) {
  return transitionCall(
    callId,
    [TableCallStatus.RAISED],
    { status: TableCallStatus.ACKNOWLEDGED, acknowledgedById: actorId, acknowledgedAt: new Date() },
    actorId,
  );
}

// "Done." Straight from RAISED too (the waiter was passing by).
export function resolveCall(callId: string, actorId: string) {
  return transitionCall(
    callId,
    OPEN_CALL_STATUSES,
    { status: TableCallStatus.RESOLVED, resolvedById: actorId, resolvedAt: new Date() },
    actorId,
  );
}

// ================= Session closed / voided =================

// Every open call of a session that is closing becomes CANCELLED, inside the closing transaction.
// Returns them so the caller can tell staff screens after commit (emitCallsCancelled).
export async function cancelOpenCallsInTransaction(tx: Prisma.TransactionClient, sessionId: string) {
  const open = await tx.tableCall.findMany({
    where: { sessionId, status: { in: OPEN_CALL_STATUSES } },
    select: { id: true, diningAreaId: true, routedToStaffId: true },
  });
  if (open.length > 0) {
    await tx.tableCall.updateMany({
      where: { id: { in: open.map((call) => call.id) }, status: { in: OPEN_CALL_STATUSES } },
      data: { status: TableCallStatus.CANCELLED },
    });
  }
  return open.map((call) => ({ ...call, status: TableCallStatus.CANCELLED }));
}

export async function emitCallsCancelled(calls: { id: string; diningAreaId: string; status: TableCallStatus; routedToStaffId: string | null }[]) {
  for (const call of calls) {
    // The table itself is refreshed once by the close/void.
    await emitCallUpdated(call, null, { refreshTable: false });
  }
}

// ================= Escalation =================

// One pass of the escalation job: every call still RAISED (nobody acknowledged it) two minutes after it
// was raised gets escalatedAt, exactly once, and reception hears "table-call:escalated". The update is
// conditional on escalatedAt still being null, so several server instances (or an overlapping pass)
// can't escalate a call twice. Returns the calls this pass escalated.
export async function escalateDueCalls(now: Date = new Date()) {
  const due = await prisma.tableCall.findMany({
    where: {
      status: TableCallStatus.RAISED,
      escalatedAt: null,
      createdAt: { lte: new Date(now.getTime() - CALL_ESCALATION_AFTER_MS) },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  const escalated: CallWithDetails[] = [];
  for (const { id } of due) {
    const won = await prisma.$transaction(async (tx) => {
      const result = await tx.tableCall.updateMany({
        where: { id, status: TableCallStatus.RAISED, escalatedAt: null },
        data: { escalatedAt: now },
      });
      if (result.count === 0) {
        return null;
      }
      const call = await tx.tableCall.findUniqueOrThrow({ where: { id }, include: callInclude });
      await touchTableSession(tx, call.sessionId);
      return call;
    });
    if (won) {
      escalated.push(won);
      emitToRooms(["pos-admin"], "table-call:escalated", {
        callId: won.id,
        sessionId: won.sessionId,
        diningAreaId: won.diningAreaId,
        tableName: won.diningArea.name,
        area: won.diningArea.area,
        type: won.type,
        note: won.note,
        guestName: won.guest?.displayName ?? null,
        createdAt: won.createdAt,
        routedToStaffId: won.routedToStaffId,
      });
      await emitTableUpdated(won.diningAreaId);
    }
  }
  return escalated;
}
