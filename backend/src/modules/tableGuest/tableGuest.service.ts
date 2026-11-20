import {
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  Prisma,
  StaffRole,
  TableCallStatus,
  TableCallType,
  TableSessionEventType,
  TableSessionStatus,
} from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { env } from "../../config/env";
import { hashClientIp } from "../guestOrder/clientIp";
import { listOnlineCategories, listQrMenuItems } from "../menu/menu.service";
import { listQrDeals } from "../deal/deal.service";
import { cancelTableGuestRound, createOrder, OrderNotAwaitingReceptionError, OrderNotFoundError } from "../order/order.service";
import { getSiteSettings } from "../siteContent/siteContent.service";
import { toPublicDeals, toPublicMenu } from "../store/publicMappers";
import { emitTableUpdated, emitToFloor, touchTableSession } from "../table/tableNotify";
import { callInclude, emitCallRaised, emitCallUpdated, OPEN_CALL_STATUSES, resolveCallTarget } from "../table/tableCall.service";
import { generateGuestToken, generateJoinPin, hashGuestToken } from "./guestToken";
import {
  callCooldownSeconds,
  checkTableCallLimits,
  checkTableOrderLimits,
  ONE_HOUR_MS,
  orderCooldownSeconds,
  TABLE_QR_LIMITS,
} from "./tableQrLimits";
import { computeTableOrdering, deriveTableRoundStatus, TableClosedReason } from "./tableStatus";
import { isBillLocked } from "../table/tableBillGuard";
import { guestBillView } from "../table/tableBill.service";
import { DISPLAY_NAME_MAX_LENGTH, JoinInput, TableCallInput, TableOrderInput } from "./tableGuest.validators";

// Every refusal on the public Table QR routes: an HTTP status and the { code, error } body the page
// branches on (same shape as guest checkout's).
export class TableGuestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

const notFound = () => new TableGuestError(404, "NOT_FOUND", "Table not found");
export const sessionEnded = () =>
  new TableGuestError(401, "SESSION_ENDED", "Your table session has ended. Scan the table's QR code again.");

const CLOSED_MESSAGES: Record<TableClosedReason, { status: number; code: string; error: string }> = {
  qr_disabled: { status: 409, code: "QR_DISABLED", error: "Ordering from the table is switched off. Please ask a staff member." },
  unavailable: { status: 409, code: "TABLE_UNAVAILABLE", error: "This table isn't available right now. Please ask a staff member." },
  not_seated: { status: 409, code: "TABLE_CLOSED", error: "This table hasn't been opened yet. Please ask a staff member to seat you." },
  no_business_day: { status: 409, code: "ORDERING_CLOSED", error: "We are not taking orders right now." },
};

async function activeBusinessDayId(): Promise<string | null> {
  const day = await prisma.businessDay.findFirst({ where: { isActive: true }, select: { id: true } });
  return day?.id ?? null;
}

// ================= GET /:qrKey =================

const tableByKeySelect = {
  id: true,
  name: true,
  area: true,
  isActive: true,
  outOfService: true,
  tableSessions: {
    where: { status: TableSessionStatus.OPEN },
    select: { id: true, businessDayId: true, joinPin: true, mergedIntoSessionId: true },
  },
} satisfies Prisma.DiningAreaSelect;

async function findTableByQrKey(qrKey: string) {
  return prisma.diningArea.findUnique({ where: { qrKey }, select: tableByKeySelect });
}

// Table sync R7: a table merged into another one's session is joined through that session — its QR still
// works, and the guest lands on the shared bill.
async function sessionForTable(open: { id: string; businessDayId: string; joinPin: string | null; mergedIntoSessionId: string | null } | null) {
  if (!open?.mergedIntoSessionId) {
    return open;
  }
  return prisma.tableSession.findFirst({
    where: { id: open.mergedIntoSessionId, status: TableSessionStatus.OPEN },
    select: { id: true, businessDayId: true, joinPin: true, mergedIntoSessionId: true },
  });
}

// What the landing page shows. Never a session id, PIN, guest list or staff name.
export async function getTableByQrKey(qrKey: string) {
  const table = await findTableByQrKey(qrKey);
  if (!table) {
    throw notFound();
  }
  const [settings, dayId] = await Promise.all([getSiteSettings(), activeBusinessDayId()]);
  const session = await sessionForTable(table.tableSessions[0] ?? null);
  const ordering = computeTableOrdering({
    tableQrEnabled: settings.tableQrEnabled,
    tableActive: table.isActive,
    outOfService: table.outOfService,
    sessionBusinessDayId: session?.businessDayId ?? null,
    activeBusinessDayId: dayId,
  });
  const state = !table.isActive || table.outOfService ? "UNAVAILABLE" : session ? "OPEN" : "CLOSED";
  return {
    table: { name: table.name, area: table.area },
    state,
    requiresPin: session !== null && session.joinPin !== null,
    ...ordering,
  };
}

// ================= POST /:qrKey/join =================

export interface JoinResult {
  token: string;
  guest: { id: string; displayName: string; joinOrder: number };
  session: { table: { name: string; area: string | null } };
}

// "Ali", or "Ali 2" / "Ali 3"... when the session already has an Ali — so staff and the bill can tell
// two guests apart. Kept within the column's 30 characters.
export function uniqueDisplayName(wanted: string, taken: string[]): string {
  const lower = new Set(taken.map((name) => name.toLowerCase()));
  if (!lower.has(wanted.toLowerCase())) {
    return wanted;
  }
  for (let n = 2; ; n += 1) {
    const suffix = ` ${n}`;
    const candidate = `${wanted.slice(0, DISPLAY_NAME_MAX_LENGTH - suffix.length).trimEnd()}${suffix}`;
    if (!lower.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
}

type JoinOutcome =
  | { kind: "joined"; result: JoinResult; sessionId: string; diningAreaId: string; tableName: string; guestCount: number }
  | { kind: "bad_pin"; attemptsLeft: number }
  | { kind: "pin_locked"; sessionId: string; diningAreaId: string; tableName: string };

export async function joinTable(qrKey: string, input: JoinInput, clientIp: string | undefined): Promise<{ result: JoinResult; isNew: boolean }> {
  const table = await findTableByQrKey(qrKey);
  if (!table) {
    throw notFound();
  }
  const [settings, dayId] = await Promise.all([getSiteSettings(), activeBusinessDayId()]);
  const session = await sessionForTable(table.tableSessions[0] ?? null);
  // Joining needs exactly what ordering needs: QR switched on, an available, seated table, and the
  // active business day being the session's own (a table left seated past a forced day-end can't be
  // joined; staff close and reseat it).
  const gate = computeTableOrdering({
    tableQrEnabled: settings.tableQrEnabled,
    tableActive: table.isActive,
    outOfService: table.outOfService,
    sessionBusinessDayId: session?.businessDayId ?? null,
    activeBusinessDayId: dayId,
  });
  if (!gate.orderingOpen || session === null) {
    const refusal = CLOSED_MESSAGES[gate.closedReason ?? "not_seated"];
    throw new TableGuestError(refusal.status, refusal.code, refusal.error);
  }

  // A retried Join (the response was lost): the same guest, with a fresh token (the old one is
  // replaced — the phone never got it). Never for a different session.
  const replay = await prisma.tableGuest.findUnique({
    where: { joinRequestId: input.joinRequestId },
    select: { id: true, sessionId: true, displayName: true, joinOrder: true, revokedAt: true },
  });
  if (replay) {
    if (replay.sessionId !== session.id || replay.revokedAt !== null) {
      throw new TableGuestError(409, "REQUEST_ID_REUSED", "This join request was already used. Please try again.");
    }
    const token = generateGuestToken();
    await prisma.tableGuest.update({ where: { id: replay.id }, data: { tokenHash: hashGuestToken(token), lastSeenAt: new Date() } });
    return {
      result: { token, guest: { id: replay.id, displayName: replay.displayName, joinOrder: replay.joinOrder }, session: { table: { name: table.name, area: table.area } } },
      isNew: false,
    };
  }

  const ipHash = hashClientIp(clientIp, env.JWT_SECRET);
  const token = generateGuestToken();

  const outcome = await prisma.$transaction(async (tx): Promise<JoinOutcome> => {
    // Serialises joins (and PIN tries) on this session, so the guest cap and the PIN-failure count are exact.
    await tx.$queryRaw`SELECT id FROM "TableSession" WHERE id = ${session.id} FOR UPDATE`;
    const current = await tx.tableSession.findUnique({
      where: { id: session.id },
      select: { status: true, joinPin: true, pinFailures: true },
    });
    if (!current || current.status !== TableSessionStatus.OPEN) {
      throw new TableGuestError(409, "TABLE_CLOSED", CLOSED_MESSAGES.not_seated.error);
    }

    if (current.joinPin !== null && input.pin !== current.joinPin) {
      const failures = current.pinFailures + 1;
      if (failures >= TABLE_QR_LIMITS.pinFailures) {
        // Too many wrong PINs: draw a new one (only staff can read it) and start counting again.
        await tx.tableSession.update({ where: { id: session.id }, data: { joinPin: generateJoinPin(), pinFailures: 0 } });
        await tx.tableSessionEvent.create({
          data: { sessionId: session.id, type: TableSessionEventType.PIN_LOCKED, after: { failures } },
        });
        return { kind: "pin_locked", sessionId: session.id, diningAreaId: table.id, tableName: table.name };
      }
      await tx.tableSession.update({ where: { id: session.id }, data: { pinFailures: failures } });
      return { kind: "bad_pin", attemptsLeft: TABLE_QR_LIMITS.pinFailures - failures };
    }

    const activeGuests = await tx.tableGuest.findMany({
      where: { sessionId: session.id },
      select: { displayName: true, joinOrder: true, revokedAt: true },
    });
    if (activeGuests.filter((guest) => guest.revokedAt === null).length >= TABLE_QR_LIMITS.sessionGuests) {
      throw new TableGuestError(409, "SESSION_FULL", "This table already has the most guests it can take.");
    }
    const joinsFromIp = await tx.tableGuest.count({
      where: { joinIpHash: ipHash, createdAt: { gte: new Date(Date.now() - ONE_HOUR_MS) } },
    });
    if (joinsFromIp >= TABLE_QR_LIMITS.joinsPerIpHashPerHour) {
      throw new TableGuestError(429, "TOO_MANY", "Too many joins from this connection. Please ask a staff member.");
    }

    const displayName = uniqueDisplayName(input.displayName, activeGuests.map((guest) => guest.displayName));
    const joinOrder = activeGuests.reduce((max, guest) => Math.max(max, guest.joinOrder), 0) + 1;
    const guest = await tx.tableGuest.create({
      data: {
        sessionId: session.id,
        displayName,
        tokenHash: hashGuestToken(token),
        joinRequestId: input.joinRequestId,
        joinOrder,
        joinIpHash: ipHash,
      },
      select: { id: true, displayName: true, joinOrder: true },
    });
    await tx.tableSessionEvent.create({
      data: { sessionId: session.id, type: TableSessionEventType.GUEST_JOINED, guestId: guest.id, after: { displayName } },
    });
    await touchTableSession(tx, session.id);
    return {
      kind: "joined",
      result: { token, guest, session: { table: { name: table.name, area: table.area } } },
      sessionId: session.id,
      diningAreaId: table.id,
      tableName: table.name,
      guestCount: activeGuests.filter((g) => g.revokedAt === null).length + 1,
    };
  });

  if (outcome.kind === "bad_pin") {
    throw new TableGuestError(400, "BAD_PIN", "That PIN isn't right. Please check it with a staff member.", {
      attemptsLeft: outcome.attemptsLeft,
    });
  }
  if (outcome.kind === "pin_locked") {
    emitToFloor("table-session:pin-locked", { sessionId: outcome.sessionId, diningAreaId: outcome.diningAreaId, tableName: outcome.tableName });
    throw new TableGuestError(423, "PIN_LOCKED", "Too many wrong PINs. Please ask a staff member for the new PIN.");
  }
  emitToFloor("table-guest:joined", {
    sessionId: outcome.sessionId,
    diningAreaId: outcome.diningAreaId,
    tableName: outcome.tableName,
    displayName: outcome.result.guest.displayName,
    guestCount: outcome.guestCount,
  });
  await emitTableUpdated(outcome.diningAreaId);
  return { result: outcome.result, isNew: true };
}

// ================= Guest auth (X-Table-Token) =================

export interface AuthenticatedGuest {
  id: string;
  displayName: string;
  joinOrder: number;
  sessionId: string;
  diningAreaId: string;
}

const LAST_SEEN_THROTTLE_MS = 60_000;

// The guest behind a token, or null when the token is unknown, the guest was removed, or the session
// is no longer open — every one of which the caller answers 401 SESSION_ENDED.
export async function authenticateGuest(token: string): Promise<AuthenticatedGuest | null> {
  const guest = await prisma.tableGuest.findUnique({
    where: { tokenHash: hashGuestToken(token) },
    select: {
      id: true,
      displayName: true,
      joinOrder: true,
      revokedAt: true,
      lastSeenAt: true,
      session: { select: { id: true, status: true, diningAreaId: true } },
    },
  });
  if (!guest || guest.revokedAt !== null || guest.session.status !== TableSessionStatus.OPEN) {
    return null;
  }
  if (Date.now() - guest.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.tableGuest.update({ where: { id: guest.id }, data: { lastSeenAt: new Date() } });
  }
  return {
    id: guest.id,
    displayName: guest.displayName,
    joinOrder: guest.joinOrder,
    sessionId: guest.session.id,
    diningAreaId: guest.session.diningAreaId,
  };
}

// ================= GET /session (the poll) =================

export async function getSessionVersion(sessionId: string): Promise<number | null> {
  const session = await prisma.tableSession.findUnique({ where: { id: sessionId }, select: { version: true } });
  return session?.version ?? null;
}

export function sessionEtag(guest: AuthenticatedGuest, version: number): string {
  return `"ts-${guest.sessionId}-${version}-${guest.id}"`;
}

const roundLineItemSelect = {
  id: true,
  quantity: true,
  subtotal: true,
  status: true,
  variantLabel: true,
  addOns: true,
  notes: true,
  dealOrderLineId: true,
  tableGuestId: true,
  menuItem: { select: { name: true, nameUr: true } },
} satisfies Prisma.OrderItemSelect;

function addOnNames(raw: unknown): { name: string; price: string }[] {
  return Array.isArray(raw)
    ? raw
        .filter((entry): entry is { name: string; price: string } => typeof entry === "object" && entry !== null && "name" in entry)
        .map((entry) => ({ name: String(entry.name), price: String((entry as { price?: unknown }).price ?? "0") }))
    : [];
}

// Everything the guest's phone shows, built field by field. Never: the PIN, tokens, the QR key, staff
// names or ids, phone numbers.
export async function getSessionPoll(guest: AuthenticatedGuest) {
  const session = await prisma.tableSession.findUniqueOrThrow({
    where: { id: guest.sessionId },
    select: {
      version: true,
      status: true,
      seatedAt: true,
      businessDayId: true,
      diningArea: { select: { name: true, area: true, isActive: true, outOfService: true } },
      // Table sync R7: tables merged into this session, and the latest move of the party.
      mergedChildren: { where: { status: TableSessionStatus.OPEN }, select: { diningArea: { select: { name: true } } } },
      events: {
        where: { type: TableSessionEventType.TABLE_MOVED },
        select: { after: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      guests: { where: { revokedAt: null }, select: { id: true, displayName: true, joinOrder: true }, orderBy: { joinOrder: "asc" } },
      orders: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          cancelledReason: true,
          createdAt: true,
          totalAmount: true,
          tableGuestId: true,
          tableGuest: { select: { displayName: true } },
          items: { select: roundLineItemSelect },
          dealLines: {
            select: { id: true, dealName: true, quantity: true, subtotal: true, notes: true, tableGuestId: true, deal: { select: { nameUr: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  const [settings, dayId, myCalls] = await Promise.all([
    getSiteSettings(),
    activeBusinessDayId(),
    // My calls, newest first: the open ones plus recently dealt-with ones, so the phone can show "on my
    // way" / "done". Never who dealt with it.
    prisma.tableCall.findMany({
      where: { guestId: guest.id, status: { not: TableCallStatus.CANCELLED } },
      select: { id: true, type: true, note: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);
  const ordering = computeTableOrdering({
    tableQrEnabled: settings.tableQrEnabled,
    tableActive: session.diningArea.isActive,
    outOfService: session.diningArea.outOfService,
    sessionBusinessDayId: session.status === TableSessionStatus.OPEN ? session.businessDayId : null,
    activeBusinessDayId: dayId,
  });
  const myLastCallAt = myCalls[0]?.createdAt ?? null;
  const myLastOrderAt = session.orders.filter((order) => order.tableGuestId === guest.id).at(-1)?.createdAt ?? null;

  const rounds = session.orders.map((order) => ({
    orderId: order.id,
    orderNumber: order.orderNumber,
    guestName: order.tableGuest?.displayName ?? null,
    isMine: order.tableGuestId === guest.id,
    status: deriveTableRoundStatus(order.status, order.items.map((item) => item.status)),
    // Only a reason staff gave (a rejection); the guest's own cancel shows as plain "Cancelled".
    cancelReason: order.status === OrderStatus.CANCELLED ? order.cancelledReason : null,
    createdAt: order.createdAt,
    total: order.totalAmount.toString(),
    lines: [
      // Direct lines only; a deal's exploded items are listed under the deal line instead.
      ...order.items
        .filter((item) => item.dealOrderLineId === null)
        .map((item) => ({
          kind: "item" as const,
          lineId: item.id,
          name: item.menuItem.name,
          nameUr: item.menuItem.nameUr,
          size: item.variantLabel,
          addOns: addOnNames(item.addOns),
          quantity: item.quantity,
          lineTotal: item.subtotal.toString(),
          note: item.notes,
          ownerGuestId: item.tableGuestId,
        })),
      ...order.dealLines.map((line) => ({
        kind: "deal" as const,
        lineId: line.id,
        name: line.dealName,
        nameUr: line.deal?.nameUr ?? null,
        size: null,
        addOns: [],
        quantity: line.quantity,
        lineTotal: line.subtotal.toString(),
        note: line.notes,
        ownerGuestId: line.tableGuestId,
      })),
    ],
  }));

  const lastMove = session.events[0]?.after as { fromTableName?: unknown } | undefined;
  return {
    version: session.version,
    table: {
      name: session.diningArea.name,
      area: session.diningArea.area,
      // The party was moved here from another table: the phone shows "Your table moved to …" once.
      movedFrom: typeof lastMove?.fromTableName === "string" ? { name: lastMove.fromTableName, at: session.events[0]?.createdAt ?? null } : null,
    },
    // Tables merged into this one's bill ("Table 2 + Table 3").
    joinedTables: session.mergedChildren.map((child) => child.diningArea.name),
    session: { status: session.status, seatedAt: session.seatedAt, ...ordering },
    me: { guestId: guest.id, displayName: guest.displayName, joinOrder: guest.joinOrder },
    guests: session.guests.map((other) => ({ id: other.id, displayName: other.displayName, isMe: other.id === guest.id })),
    rounds,
    myCalls,
    cooldowns: {
      orderSeconds: orderCooldownSeconds(myLastOrderAt, new Date()),
      callSeconds: callCooldownSeconds(myLastCallAt, new Date()),
    },
    // Phase 2: the table's bill as this guest sees it (null until someone asks for it), and the receipt
    // link once the bill is paid (after the close the token is dead, so it also comes with the 401).
    bill: await guestBillView(prisma, guest.sessionId, guest.id),
    receiptKey: (await prisma.tableReceipt.findUnique({ where: { sessionId: guest.sessionId }, select: { receiptKey: true } }))?.receiptKey ?? null,
  };
}

// ================= POST /orders =================

export interface TableOrderResult {
  orderId: string;
  orderNumber: number;
  status: "RECEIVED";
  total: string;
}

class TableLimitError extends TableGuestError {}

async function findOrderReplay(clientRequestId: string, guestId: string): Promise<TableOrderResult | null> {
  const existing = await prisma.order.findUnique({
    where: { clientRequestId },
    select: { id: true, orderNumber: true, totalAmount: true, tableGuestId: true },
  });
  if (!existing) {
    return null;
  }
  // Only the same guest gets the original answer back.
  if (existing.tableGuestId !== guestId) {
    throw new TableGuestError(409, "REQUEST_ID_REUSED", "This request id was already used for a different order.");
  }
  return { orderId: existing.id, orderNumber: existing.orderNumber, status: "RECEIVED", total: existing.totalAmount.toString() };
}

function isUniqueViolationOn(error: unknown, column: string): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    JSON.stringify(error.meta?.target ?? "").includes(column)
  );
}

export async function createTableOrder(
  guest: AuthenticatedGuest,
  input: TableOrderInput,
): Promise<{ result: TableOrderResult; isNew: boolean }> {
  // A retry of a round that already went through gets the same answer and counts toward no limit.
  const replay = await findOrderReplay(input.clientRequestId, guest.id);
  if (replay) {
    return { result: replay, isNew: false };
  }

  const session = await prisma.tableSession.findUnique({
    where: { id: guest.sessionId },
    select: {
      status: true,
      businessDayId: true,
      diningAreaId: true,
      diningArea: { select: { isActive: true, outOfService: true } },
      waiterStaff: { select: { isActive: true, role: true, employee: { select: { id: true, isActive: true } } } },
    },
  });
  if (!session || session.status !== TableSessionStatus.OPEN) {
    throw sessionEnded();
  }
  const [settings, dayId] = await Promise.all([getSiteSettings(), activeBusinessDayId()]);
  const ordering = computeTableOrdering({
    tableQrEnabled: settings.tableQrEnabled,
    tableActive: session.diningArea.isActive,
    outOfService: session.diningArea.outOfService,
    sessionBusinessDayId: session.businessDayId,
    activeBusinessDayId: dayId,
  });
  if (!ordering.orderingOpen) {
    const refusal = CLOSED_MESSAGES[ordering.closedReason ?? "no_business_day"];
    throw new TableGuestError(refusal.status, refusal.code, refusal.error);
  }

  // The session's waiter on the order too, so the existing waiter reports see table rounds — only when
  // that login is linked to an active employee (createOrder refuses an inactive one).
  const waiter = session.waiterStaff;
  const waiterId =
    waiter && waiter.isActive && waiter.role !== StaffRole.KITCHEN && waiter.employee?.isActive ? waiter.employee.id : undefined;

  // Counted inside createOrder's transaction, after its per-business-day lock: two rounds sent at the
  // same moment can't both slip under a limit, and a session closed meanwhile refuses the round.
  const guard = async (tx: Prisma.TransactionClient) => {
    // Locks the session row: a staff close/void of this table waits for this round (and then sees it),
    // or wins first and this round sees the session closed.
    await tx.$queryRaw`SELECT id FROM "TableSession" WHERE id = ${guest.sessionId} FOR UPDATE`;
    const now = await tx.tableSession.findUnique({ where: { id: guest.sessionId }, select: { status: true } });
    const me = await tx.tableGuest.findUnique({ where: { id: guest.id }, select: { revokedAt: true } });
    if (now?.status !== TableSessionStatus.OPEN || !me || me.revokedAt !== null) {
      throw sessionEnded();
    }
    // The bill has been asked for: the table is locked until staff unlock it (spec §3.5). Checked under
    // the session lock, so a round and a bill request can't both slip through.
    if (await isBillLocked(tx, guest.sessionId)) {
      throw new TableGuestError(409, "BILL_LOCKED", "The bill has been asked for, so new orders are paused. Ask a staff member if you'd like to order more.");
    }
    const [guestAwaiting, sessionAwaiting, sessionOrders, last] = await Promise.all([
      tx.order.count({ where: { tableGuestId: guest.id, status: OrderStatus.AWAITING_RECEPTION } }),
      tx.order.count({ where: { tableSessionId: guest.sessionId, status: OrderStatus.AWAITING_RECEPTION } }),
      tx.order.count({ where: { tableSessionId: guest.sessionId } }),
      tx.order.findFirst({ where: { tableGuestId: guest.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    ]);
    const verdict = checkTableOrderLimits(
      { guestAwaiting, sessionAwaiting, sessionOrders, guestLastOrderAt: last?.createdAt ?? null },
      new Date(),
    );
    if (!verdict.ok) {
      throw verdict.code === "COOLDOWN"
        ? new TableLimitError(429, "COOLDOWN", "Please wait a moment before sending another order.", { retryAfterSeconds: verdict.retryAfterSeconds })
        : new TableLimitError(429, "TOO_MANY", "This table has too many orders waiting. Please wait for staff to review them.");
    }
  };

  try {
    const order = await createOrder({
      source: OrderSource.TABLE_QR,
      type: OrderType.DINE_IN,
      // A placeholder until the table pays: the bill (or the staff's Confirm Payment) settles it.
      paymentMethod: PaymentMethod.CASH,
      status: OrderStatus.AWAITING_RECEPTION,
      diningAreaId: session.diningAreaId,
      ...(waiterId !== undefined ? { waiterId } : {}),
      tableSessionId: guest.sessionId,
      tableGuestId: guest.id,
      clientRequestId: input.clientRequestId,
      qrOnly: true,
      maxTotal: new Prisma.Decimal(TABLE_QR_LIMITS.orderMaxTotal),
      guard,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      items: input.items,
      deals: input.deals,
    });
    return {
      result: { orderId: order.id, orderNumber: order.orderNumber, status: "RECEIVED", total: order.totalAmount.toString() },
      isNew: true,
    };
  } catch (error) {
    // True race: the same round sent twice at once. The unique constraint is the backstop.
    if (isUniqueViolationOn(error, "clientRequestId")) {
      const raced = await findOrderReplay(input.clientRequestId, guest.id);
      if (raced) {
        return { result: raced, isNew: false };
      }
    }
    throw error;
  }
}

// ================= POST /orders/:orderId/cancel =================

export async function cancelOwnRound(guest: AuthenticatedGuest, orderId: string) {
  try {
    await cancelTableGuestRound(orderId, guest.id);
  } catch (error) {
    if (error instanceof OrderNotFoundError) {
      throw new TableGuestError(404, "NOT_FOUND", "Order not found");
    }
    if (error instanceof OrderNotAwaitingReceptionError) {
      throw new TableGuestError(409, "NOT_CANCELLABLE", "This order has already been reviewed and can't be cancelled here.");
    }
    throw error;
  }
  return { status: "CANCELLED" as const };
}

// ================= GET /menu =================

// The QR menu: the website's menu and deal shapes (same whitelist mappers), filtered on the QR flag.
export async function getQrMenu() {
  const [categories, items, deals] = await Promise.all([listOnlineCategories(), listQrMenuItems(), listQrDeals()]);
  return { ...toPublicMenu(categories, items), deals: toPublicDeals(deals) };
}

// ================= POST /calls (waiter calls, build step 3) =================

export interface TableCallResult {
  id: string;
  type: TableCallType;
  note: string | null;
  status: TableCallStatus;
  createdAt: Date;
}

async function findCallReplay(clientRequestId: string, guestId: string): Promise<TableCallResult | null> {
  const existing = await prisma.tableCall.findUnique({
    where: { clientRequestId },
    select: { id: true, type: true, note: true, status: true, createdAt: true, guestId: true },
  });
  if (!existing) {
    return null;
  }
  if (existing.guestId !== guestId) {
    throw new TableGuestError(409, "REQUEST_ID_REUSED", "This request id was already used for a different call.");
  }
  return { id: existing.id, type: existing.type, note: existing.note, status: existing.status, createdAt: existing.createdAt };
}

// A guest calls a waiter to the table. At most 3 open calls per session and 60 s between one guest's
// calls, counted under the session row lock (two taps at once can't both slip through). Routed to the
// session's waiter if that login can still take calls, otherwise to every order taker and reception.
export async function createTableCall(
  guest: AuthenticatedGuest,
  input: TableCallInput,
): Promise<{ result: TableCallResult; isNew: boolean }> {
  const replay = await findCallReplay(input.clientRequestId, guest.id);
  if (replay) {
    return { result: replay, isNew: false };
  }

  const session = await prisma.tableSession.findUnique({
    where: { id: guest.sessionId },
    select: { status: true, businessDayId: true, diningArea: { select: { isActive: true, outOfService: true } } },
  });
  if (!session || session.status !== TableSessionStatus.OPEN) {
    throw sessionEnded();
  }
  const [settings, dayId] = await Promise.all([getSiteSettings(), activeBusinessDayId()]);
  const gate = computeTableOrdering({
    tableQrEnabled: settings.tableQrEnabled,
    tableActive: session.diningArea.isActive,
    outOfService: session.diningArea.outOfService,
    sessionBusinessDayId: session.businessDayId,
    activeBusinessDayId: dayId,
  });
  if (!gate.orderingOpen) {
    const refusal = CLOSED_MESSAGES[gate.closedReason ?? "no_business_day"];
    throw new TableGuestError(refusal.status, refusal.code, refusal.error);
  }

  let call;
  try {
    call = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "TableSession" WHERE id = ${guest.sessionId} FOR UPDATE`;
      const current = await tx.tableSession.findUnique({
        where: { id: guest.sessionId },
        select: { status: true, diningAreaId: true, waiterStaffId: true },
      });
      const me = await tx.tableGuest.findUnique({ where: { id: guest.id }, select: { revokedAt: true } });
      if (!current || current.status !== TableSessionStatus.OPEN || !me || me.revokedAt !== null) {
        throw sessionEnded();
      }
      const sessionOpenCalls = await tx.tableCall.count({
        where: { sessionId: guest.sessionId, status: { in: OPEN_CALL_STATUSES } },
      });
      const last = await tx.tableCall.findFirst({
        where: { guestId: guest.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      const verdict = checkTableCallLimits({ sessionOpenCalls, guestLastCallAt: last?.createdAt ?? null }, new Date());
      if (!verdict.ok) {
        throw verdict.code === "COOLDOWN"
          ? new TableGuestError(429, "COOLDOWN", "Please wait a moment before calling again.", {
              retryAfterSeconds: verdict.retryAfterSeconds,
            })
          : new TableGuestError(429, "TOO_MANY", "Staff already have this table's calls. Someone will be with you shortly.");
      }
      const routedToStaffId = await resolveCallTarget(tx, current.waiterStaffId);
      const created = await tx.tableCall.create({
        data: {
          sessionId: guest.sessionId,
          diningAreaId: current.diningAreaId,
          guestId: guest.id,
          type: input.type,
          note: input.note ?? null,
          clientRequestId: input.clientRequestId,
          routedToStaffId,
        },
        include: callInclude,
      });
      await touchTableSession(tx, guest.sessionId);
      return created;
    });
  } catch (error) {
    // The same call sent twice at once: the unique constraint is the backstop.
    if (isUniqueViolationOn(error, "clientRequestId")) {
      const raced = await findCallReplay(input.clientRequestId, guest.id);
      if (raced) {
        return { result: raced, isNew: false };
      }
    }
    throw error;
  }

  await emitCallRaised(call);
  return {
    result: { id: call.id, type: call.type, note: call.note, status: call.status, createdAt: call.createdAt },
    isNew: true,
  };
}

// The guest withdraws their own call while it is still open.
export async function cancelOwnCall(guest: AuthenticatedGuest, callId: string) {
  const call = await prisma.tableCall.findFirst({
    where: { id: callId, guestId: guest.id, sessionId: guest.sessionId },
    select: { id: true },
  });
  if (!call) {
    throw new TableGuestError(404, "NOT_FOUND", "Call not found");
  }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.tableCall.updateMany({
      where: { id: callId, status: { in: OPEN_CALL_STATUSES } },
      data: { status: TableCallStatus.CANCELLED },
    });
    if (result.count === 0) {
      throw new TableGuestError(409, "NOT_OPEN", "This call has already been dealt with.");
    }
    await touchTableSession(tx, guest.sessionId);
    return tx.tableCall.findUniqueOrThrow({
      where: { id: callId },
      select: { id: true, diningAreaId: true, status: true, routedToStaffId: true },
    });
  });
  await emitCallUpdated(updated, guest.displayName);
  return { status: TableCallStatus.CANCELLED };
}
