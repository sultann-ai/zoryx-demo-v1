import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  SplitMode,
  StaffRole,
  TableBillLineKind,
  TableBillStatus,
  TableCallType,
  TableSessionEventType,
  TableSessionStatus,
  TableShareStatus,
} from "../../../generated/prisma/client";
import { computeOrderTotal } from "../../common/orderTotals";
import type { ProcessedMedia } from "../../common/media/processImage";
import { prisma } from "../../config/prisma";
import { releaseMediaIfUnreferenced } from "../media/media.service";
import {
  checkDiscountChange,
  DiscountAboveCapError,
  discountAttribution,
  DiscountReasonRequiredError,
  DiscountReasonTooLongError,
  loadDiscountCap,
} from "../order/discountPolicy";
import { recordOrderEvent } from "../order/orderEvents";
import { announceTableOrdersCompleted, settleTableOrdersInTransaction } from "../order/order.service";
import { getSiteSettings } from "../siteContent/siteContent.service";
import { getPublicStore } from "../store/store.service";
import { generateGuestToken, hashGuestToken } from "../tableGuest/guestToken";
import {
  allocateDiscount,
  computeByItemsShares,
  computeCustomShares,
  computeEqualShares,
  SplitMathError,
  type BillClaim,
  type BillLine,
  type ComputedShare,
} from "./splitMath";
import { billableOrderWhere, computeBillTotals, orderSubtotal, splitHasPayments, syncTableBill, type BillTotals } from "./tableBillGuard";
import { callInclude, cancelOpenCallsInTransaction, emitCallRaised, emitCallsCancelled, resolveCallTarget } from "./tableCall.service";
import { TableStaffError } from "./tableErrors";
import { emitTableBillUpdated, emitTableUpdated, emitToFloor, SHARE_STATUSES_WITH_MONEY, touchTableSession } from "./tableNotify";

// The table bill (docs/TABLE_QR_SPEC.md §3.5, §3.6, §4.1 phase 2, §4.2 phase 2, §7). A view over the
// session's orders: money stays on Order. Every write runs in one transaction that locks the session row,
// then the bill row (the same order everywhere), recomputes the totals from the orders, and checks
// `expectedVersion`. Every write is idempotent: repeating a request whose result already holds answers
// 200 with the bill unchanged (no second effect, no emit), even when its expectedVersion is now stale.

type Tx = Prisma.TransactionClient;
type Decimal = Prisma.Decimal;
const D = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);

export type BillActor =
  | { kind: "guest"; guestId: string; sessionId: string }
  | { kind: "staff"; id: string; role: StaffRole };

const fail = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) =>
  new TableStaffError(status, code, message, extra);

const sessionNotFound = () => fail(404, "NOT_FOUND", "Table session not found");
const sessionNotOpen = () => fail(409, "SESSION_NOT_OPEN", "This table session is no longer open");
const notRequested = () => fail(409, "BILL_NOT_REQUESTED", "Nobody has asked for this table's bill yet");
const ordersAwaiting = () =>
  fail(409, "ORDERS_AWAITING", "An order from this table is still waiting at reception. Accept or reject it first.");
const shareNotFound = () => fail(404, "NOT_FOUND", "Share not found");
const notAwaitingPayment = () => fail(409, "NOT_AWAITING_PAYMENT", "This share isn't waiting for a payment");
const billChanged = (version: number) => fail(409, "BILL_CHANGED", "The bill changed meanwhile. Here is the latest.", { billVersion: version });

const actorStaffId = (actor: BillActor) => (actor.kind === "staff" ? actor.id : null);
const actorGuestId = (actor: BillActor) => (actor.kind === "guest" ? actor.guestId : null);

// ================= Loading and locking =================

const billInclude = {
  shares: { orderBy: [{ splitVersion: "asc" }, { position: "asc" }] },
  claims: true,
} satisfies Prisma.TableBillInclude;

type BillRow = Prisma.TableBillGetPayload<{ include: typeof billInclude }>;
type ShareRow = BillRow["shares"][number];

/** The shares of the current split (VOID ones and older splits are history). */
export const liveShares = (bill: Pick<BillRow, "shares" | "splitVersion">): ShareRow[] =>
  bill.shares.filter((share) => share.splitVersion === bill.splitVersion && share.status !== TableShareStatus.VOID);

const hasMoney = (shares: ShareRow[]) => shares.some((share) => SHARE_STATUSES_WITH_MONEY.includes(share.status));

async function lockSession(tx: Tx, sessionId: string) {
  // Same lock a guest's round and a staff close take: whichever comes second sees the first's result.
  await tx.$queryRaw`SELECT id FROM "TableSession" WHERE id = ${sessionId} FOR UPDATE`;
  const session = await tx.tableSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, diningAreaId: true, waiterStaffId: true },
  });
  if (!session) {
    throw sessionNotFound();
  }
  return session;
}

async function lockBill(tx: Tx, sessionId: string): Promise<BillRow | null> {
  await tx.$queryRaw`SELECT id FROM "TableBill" WHERE "sessionId" = ${sessionId} FOR UPDATE`;
  return tx.tableBill.findUnique({ where: { sessionId }, include: billInclude });
}

/**
 * The start of every bill write: the session open and locked, the bill locked and brought up to date with
 * its orders (a changed total cancels the split here, exactly as an order change would), and the totals.
 */
async function openBillForWrite(tx: Tx, sessionId: string, actor: BillActor, options: { requireRequested?: boolean } = {}) {
  const session = await lockSession(tx, sessionId);
  if (session.status !== TableSessionStatus.OPEN) {
    throw sessionNotOpen();
  }
  if (actor.kind === "guest") {
    const me = await tx.tableGuest.findUnique({ where: { id: actor.guestId }, select: { sessionId: true, revokedAt: true } });
    if (!me || me.sessionId !== sessionId || me.revokedAt !== null) {
      throw fail(401, "SESSION_ENDED", "Your table session has ended. Scan the table's QR code again.");
    }
  }
  await syncTableBill(tx, sessionId, actorStaffId(actor));
  const bill = await lockBill(tx, sessionId);
  if (options.requireRequested !== false && (!bill || bill.status !== TableBillStatus.REQUESTED)) {
    throw bill?.status === TableBillStatus.PAID ? fail(409, "BILL_PAID", "This bill is already paid") : notRequested();
  }
  const totals = await computeBillTotals(tx, sessionId);
  return { session, bill, totals };
}

/**
 * expectedVersion: a match goes ahead; a stale version is still fine when what was asked for already holds
 * (a retried request: 200, no second effect); anything else is BILL_CHANGED.
 */
function checkVersion(bill: BillRow, expected: number | undefined, alreadyDone: boolean): "replay" | "go" {
  if (alreadyDone) {
    return "replay";
  }
  if (expected !== undefined && expected !== bill.version) {
    throw billChanged(bill.version);
  }
  return "go";
}

async function recordBillEvent(
  tx: Tx,
  sessionId: string,
  actor: BillActor | null,
  type: TableSessionEventType,
  details: { reason?: string | null; before?: Prisma.InputJsonValue; after?: Prisma.InputJsonValue } = {},
) {
  await tx.tableSessionEvent.create({
    data: {
      sessionId,
      type,
      actorId: actor ? actorStaffId(actor) : null,
      guestId: actor ? actorGuestId(actor) : null,
      reason: details.reason ? details.reason.slice(0, 200) : null,
      ...(details.before !== undefined ? { before: details.before } : {}),
      ...(details.after !== undefined ? { after: details.after } : {}),
    },
  });
}

/** Every committed bill change: the bill's version for expectedVersion, the guests' poll version, then (after commit) the emits. */
async function bumpBill(tx: Tx, bill: { id: string; sessionId: string }, data: Prisma.TableBillUncheckedUpdateInput = {}) {
  await tx.tableBill.update({ where: { id: bill.id }, data: { ...data, version: { increment: 1 } } });
  await touchTableSession(tx, bill.sessionId);
}

async function announce(sessionId: string, diningAreaId: string) {
  await emitTableBillUpdated(sessionId);
  await emitTableUpdated(diningAreaId);
}

function rethrowMath(error: unknown): never {
  if (error instanceof SplitMathError) {
    const status = error.code === "NOBODY_TO_SHARE" || error.code === "NOTHING_TO_BILL" ? 409 : 400;
    throw fail(status, error.code, error.message, error.extra);
  }
  throw error;
}

// ================= Views =================

const moneyStr = (value: Decimal) => value.toFixed(2);

// Names for the bill's lines (the guest's "shared items" list, the receipt). Billable orders only.
async function loadLineDetails(db: Tx | typeof prisma, sessionId: string) {
  return db.order.findMany({
    where: billableOrderWhere(sessionId),
    orderBy: { orderNumber: "asc" },
    select: {
      orderNumber: true,
      tableGuestId: true,
      items: {
        where: { dealOrderLineId: null },
        select: { id: true, quantity: true, subtotal: true, variantLabel: true, tableGuestId: true, menuItem: { select: { name: true, nameUr: true } } },
      },
      dealLines: { select: { id: true, quantity: true, subtotal: true, dealName: true, tableGuestId: true, deal: { select: { nameUr: true } } } },
    },
  });
}

function shareView(share: ShareRow, meGuestId: string | null) {
  const awaiting = share.status === TableShareStatus.UNPAID || share.status === TableShareStatus.REJECTED;
  return {
    id: share.id,
    position: share.position,
    label: share.label,
    guestId: share.guestId,
    isMine: meGuestId !== null && share.guestId === meGuestId,
    amount: moneyStr(share.amount),
    status: share.status,
    method: share.method,
    // The guest chose cash: a waiter is on the way to collect it.
    cashRequested: awaiting && share.method === PaymentMethod.CASH,
    rejectedReason: share.rejectedReason,
  };
}

function blockedReason(bill: BillRow, totals: BillTotals): "ORDERS_AWAITING" | "SPLIT_HAS_PAYMENTS" | null {
  if (bill.status !== TableBillStatus.REQUESTED) {
    return null;
  }
  if (totals.awaiting) {
    return "ORDERS_AWAITING";
  }
  return hasMoney(liveShares(bill)) ? "SPLIT_HAS_PAYMENTS" : null;
}

/** The bill as a guest's poll shows it (spec §6.3): never staff names, proofs or discount reasons. */
export async function guestBillView(db: Tx | typeof prisma, sessionId: string, guestId: string) {
  const bill = await db.tableBill.findUnique({ where: { sessionId }, include: billInclude });
  if (!bill) {
    return null;
  }
  const [totals, orders, guests] = await Promise.all([
    computeBillTotals(db, sessionId),
    loadLineDetails(db, sessionId),
    db.tableGuest.findMany({ where: { sessionId }, select: { id: true, displayName: true } }),
  ]);
  const nameOf = new Map(guests.map((guest) => [guest.id, guest.displayName]));
  const claimsFor = (kind: TableBillLineKind, lineId: string) =>
    [...new Set(bill.claims.filter((claim) => claim.lineKind === kind && claim.lineId === lineId).map((claim) => claim.guestId))];
  const sharedLines = orders.flatMap((order) => [
    ...order.items
      .filter((item) => item.subtotal.greaterThan(0) && item.tableGuestId !== guestId)
      .map((item) => ({
        lineKind: TableBillLineKind.ITEM,
        lineId: item.id,
        name: item.menuItem.name,
        nameUr: item.menuItem.nameUr,
        size: item.variantLabel,
        quantity: item.quantity,
        lineTotal: moneyStr(item.subtotal),
        ownerName: item.tableGuestId ? (nameOf.get(item.tableGuestId) ?? null) : null,
        claimedBy: claimsFor(TableBillLineKind.ITEM, item.id).map((id) => nameOf.get(id) ?? ""),
      })),
    ...order.dealLines
      .filter((line) => line.tableGuestId !== guestId)
      .map((line) => ({
        lineKind: TableBillLineKind.DEAL,
        lineId: line.id,
        name: line.dealName,
        nameUr: line.deal?.nameUr ?? null,
        size: null,
        quantity: line.quantity,
        lineTotal: moneyStr(line.subtotal),
        ownerName: line.tableGuestId ? (nameOf.get(line.tableGuestId) ?? null) : null,
        claimedBy: claimsFor(TableBillLineKind.DEAL, line.id).map((id) => nameOf.get(id) ?? ""),
      })),
  ]);
  const live = liveShares(bill);
  const blocked = blockedReason(bill, totals);
  return {
    version: bill.version,
    status: bill.status,
    subtotal: moneyStr(bill.subtotal),
    discount: moneyStr(bill.discount),
    total: moneyStr(bill.total),
    splitMode: bill.splitMode,
    splitVersion: bill.splitVersion,
    canSplit: bill.status === TableBillStatus.REQUESTED && blocked === null,
    blockedReason: blocked,
    // The split was cancelled by a change to the bill: "The bill changed — please split again".
    needsSplit: bill.status === TableBillStatus.REQUESTED && bill.splitMode !== null && live.length === 0,
    shares: live.map((share) => shareView(share, guestId)),
    myClaims: bill.claims.filter((claim) => claim.guestId === guestId).map((claim) => ({ lineKind: claim.lineKind, lineId: claim.lineId })),
    sharedLines,
  };
}

/** The bill for staff (POS bill page): every share with its payment details. */
export async function staffBillView(db: Tx | typeof prisma, sessionId: string) {
  const bill = await db.tableBill.findUnique({ where: { sessionId }, include: billInclude });
  if (!bill) {
    return null;
  }
  const totals = await computeBillTotals(db, sessionId);
  const live = liveShares(bill);
  return {
    id: bill.id,
    version: bill.version,
    status: bill.status,
    requestedAt: bill.requestedAt,
    requestedByGuestId: bill.requestedByGuestId,
    requestedByStaffId: bill.requestedByStaffId,
    subtotal: moneyStr(bill.subtotal),
    discount: moneyStr(bill.discount),
    total: moneyStr(bill.total),
    discountReason: bill.discountReason,
    splitMode: bill.splitMode,
    splitVersion: bill.splitVersion,
    blockedReason: blockedReason(bill, totals),
    needsSplit: bill.status === TableBillStatus.REQUESTED && bill.splitMode !== null && live.length === 0,
    paidAt: bill.paidAt,
    shares: live.map((share) => ({
      ...shareView(share, null),
      hasProof: share.paymentProofMediaId !== null,
      paidAmount: share.paidAmount ? moneyStr(share.paidAmount) : null,
      change: share.paidAmount ? moneyStr(share.paidAmount.minus(share.amount)) : null,
      verifiedAt: share.verifiedAt,
    })),
  };
}

async function viewFor(actor: BillActor, sessionId: string) {
  return actor.kind === "guest" ? guestBillView(prisma, sessionId, actor.guestId) : staffBillView(prisma, sessionId);
}

/** Runs a bill write; a BILL_CHANGED refusal carries the current bill, so the page can redraw it. */
async function writeBill(
  actor: BillActor,
  sessionId: string,
  work: (tx: Tx) => Promise<{ changed: boolean; diningAreaId: string; after?: () => Promise<void> }>,
) {
  let outcome;
  try {
    outcome = await prisma.$transaction(work);
  } catch (error) {
    if (error instanceof TableStaffError && error.code === "BILL_CHANGED") {
      throw fail(409, "BILL_CHANGED", error.message, { ...error.extra, bill: await viewFor(actor, sessionId) });
    }
    rethrowMath(error);
  }
  if (outcome.changed) {
    await outcome.after?.();
    await announce(sessionId, outcome.diningAreaId);
  }
  return { bill: await viewFor(actor, sessionId) };
}

// ================= Request / unlock =================

/** Any active guest or staff (SA, PA, OT). Idempotent: an already requested bill answers unchanged. */
export function requestBill(sessionId: string, actor: BillActor) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill, totals } = await openBillForWrite(tx, sessionId, actor, { requireRequested: false });
    if (bill && (bill.status === TableBillStatus.REQUESTED || bill.status === TableBillStatus.PAID)) {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    if (totals.orders.length === 0) {
      throw fail(409, "NOTHING_TO_BILL", "There is nothing to pay for at this table yet");
    }
    const requestedBy = { requestedByGuestId: actorGuestId(actor), requestedByStaffId: actorStaffId(actor), requestedAt: new Date() };
    const snapshot = { subtotal: totals.subtotal, discount: totals.discount, total: totals.total };
    if (bill) {
      await bumpBill(tx, bill, { status: TableBillStatus.REQUESTED, ...requestedBy, ...snapshot });
    } else {
      await tx.tableBill.create({ data: { sessionId, status: TableBillStatus.REQUESTED, ...requestedBy, ...snapshot } });
      await touchTableSession(tx, sessionId);
    }
    await recordBillEvent(tx, sessionId, actor, TableSessionEventType.BILL_REQUESTED, { after: { total: moneyStr(totals.total) } });
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

/** SA, PA: let the table order again. Unpaid shares go VOID; refused once a share has money on it. */
export function unlockBill(sessionId: string, actor: BillActor, expectedVersion: number) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill } = await openBillForWrite(tx, sessionId, actor, { requireRequested: false });
    if (!bill) {
      throw notRequested();
    }
    if (bill.status === TableBillStatus.PAID) {
      throw fail(409, "BILL_PAID", "This bill is already paid");
    }
    if (checkVersion(bill, expectedVersion, bill.status === TableBillStatus.UNLOCKED) === "replay") {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    const live = liveShares(bill);
    if (hasMoney(live)) {
      throw splitHasPayments();
    }
    if (live.length > 0) {
      await tx.tableBillShare.updateMany({ where: { id: { in: live.map((share) => share.id) } }, data: { status: TableShareStatus.VOID } });
    }
    await bumpBill(tx, bill, { status: TableBillStatus.UNLOCKED, splitMode: null, splitVersion: { increment: 1 } });
    await recordBillEvent(tx, sessionId, actor, TableSessionEventType.BILL_UNLOCKED);
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

// ================= Discount (staff) =================

/**
 * SA, PA: one discount for the whole bill, before splitting (spec §7.2). Same cap and reason rules as an
 * order discount, checked on the bill's subtotal; then allocated onto the billable orders (each gets its
 * own discount, total and DISCOUNT_SET event, so reports stay right). Cancels the split.
 */
export function setBillDiscount(
  sessionId: string,
  actor: Extract<BillActor, { kind: "staff" }>,
  input: { discount: Decimal; discountReason: string | null; expectedVersion: number },
) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill, totals } = await openBillForWrite(tx, sessionId, actor);
    if (!bill) {
      throw notRequested();
    }
    if (checkVersion(bill, input.expectedVersion, totals.discount.equals(input.discount)) === "replay") {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    if (totals.awaiting) {
      throw ordersAwaiting();
    }
    const live = liveShares(bill);
    if (hasMoney(live)) {
      throw splitHasPayments();
    }
    let check;
    try {
      check = checkDiscountChange({
        next: input.discount,
        current: totals.discount,
        subtotal: totals.subtotal,
        actor: { actorId: actor.id, role: actor.role, reason: input.discountReason },
        capPercent: await loadDiscountCap(tx),
      });
    } catch (error) {
      if (error instanceof DiscountAboveCapError) {
        throw fail(403, "DISCOUNT_ABOVE_CAP", error.message);
      }
      if (error instanceof DiscountReasonRequiredError || error instanceof DiscountReasonTooLongError) {
        throw fail(400, "BAD_REQUEST", error.message);
      }
      throw error;
    }
    if (!check.changed) {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    const parts = allocateDiscount(
      totals.orders.map((order) => ({ id: order.id, orderNumber: order.orderNumber, subtotal: orderSubtotal(order) })),
      input.discount,
    );
    const attribution = discountAttribution({ actorId: actor.id, role: actor.role }, check.reason);
    for (const order of totals.orders) {
      const next = parts.get(order.id) ?? D(0);
      if (next.equals(order.discount)) {
        continue;
      }
      const full = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { deliveryFee: true } });
      const totalAmount = computeOrderTotal({
        itemsTotal: order.items.reduce((sum, item) => sum.plus(item.subtotal), D(0)),
        dealLinesTotal: order.dealLines.reduce((sum, line) => sum.plus(line.subtotal), D(0)),
        discount: next,
        deliveryFee: full.deliveryFee,
      });
      const updated = await tx.order.updateMany({
        where: { id: order.id, discount: order.discount, status: order.status },
        data: { discount: next, totalAmount, ...attribution },
      });
      if (updated.count === 0) {
        throw billChanged(bill.version);
      }
      await recordOrderEvent(tx, {
        orderId: order.id,
        actorId: actor.id,
        type: "DISCOUNT_SET",
        reason: check.reason,
        before: { discount: moneyStr(order.discount), totalAmount: moneyStr(order.totalAmount) },
        after: { discount: moneyStr(next), totalAmount: moneyStr(totalAmount), via: "table_bill" },
      });
    }
    const after = await computeBillTotals(tx, sessionId);
    if (live.length > 0) {
      await tx.tableBillShare.updateMany({ where: { id: { in: live.map((share) => share.id) } }, data: { status: TableShareStatus.VOID } });
    }
    await bumpBill(tx, bill, {
      subtotal: after.subtotal,
      discount: after.discount,
      total: after.total,
      ...attribution,
      ...(live.length > 0 ? { splitVersion: { increment: 1 } } : {}),
    });
    await recordBillEvent(tx, sessionId, actor, TableSessionEventType.BILL_DISCOUNT_SET, {
      reason: check.reason,
      before: { discount: moneyStr(totals.discount), total: moneyStr(totals.total) },
      after: { discount: moneyStr(after.discount), total: moneyStr(after.total) },
    });
    if (live.length > 0) {
      await recordBillEvent(tx, sessionId, actor, TableSessionEventType.SPLIT_CANCELLED, { reason: "The discount changed" });
    }
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

// ================= Split =================

export interface SplitInput {
  mode: SplitMode;
  parts?: number | undefined;
  shares?: { amount: Decimal; guestId: string | null }[] | undefined;
  expectedVersion: number;
}

async function computeSplit(tx: Tx, sessionId: string, bill: BillRow, totals: BillTotals, input: Omit<SplitInput, "expectedVersion">): Promise<ComputedShare[]> {
  const guests = await tx.tableGuest.findMany({
    where: { sessionId },
    select: { id: true, displayName: true, joinOrder: true, revokedAt: true },
    orderBy: { joinOrder: "asc" },
  });
  if (input.mode === SplitMode.EQUAL) {
    const parts = input.parts ?? Math.max(1, guests.filter((guest) => guest.revokedAt === null).length);
    return computeEqualShares(totals.total, parts);
  }
  if (input.mode === SplitMode.CUSTOM) {
    const known = new Map(guests.map((guest) => [guest.id, guest.displayName]));
    for (const share of input.shares ?? []) {
      if (share.guestId !== null && !known.has(share.guestId)) {
        throw fail(400, "BAD_REQUEST", "A share's guestId isn't a guest of this table");
      }
    }
    return computeCustomShares(
      totals.total,
      (input.shares ?? []).map((share) => {
        const label = share.guestId ? known.get(share.guestId) : undefined;
        return label ? { ...share, label } : { ...share };
      }),
    );
  }
  const lines: BillLine[] = totals.orders.flatMap((order) => [
    ...order.items
      .filter((item) => item.dealOrderLineId === null)
      .map((item) => ({ kind: "ITEM" as const, id: item.id, subtotal: item.subtotal, ownerGuestId: item.tableGuestId })),
    ...order.dealLines.map((line) => ({ kind: "DEAL" as const, id: line.id, subtotal: line.subtotal, ownerGuestId: line.tableGuestId })),
  ]);
  const claims: BillClaim[] = bill.claims.map((claim) => ({ kind: claim.lineKind, lineId: claim.lineId, guestId: claim.guestId }));
  return computeByItemsShares({
    lines,
    guests: guests.map((guest) => ({ id: guest.id, displayName: guest.displayName, joinOrder: guest.joinOrder, active: guest.revokedAt === null })),
    claims,
    subtotal: totals.subtotal,
    total: totals.total,
  });
}

/** Replaces the current split with `computed`: the old shares go VOID, the new ones get the next splitVersion. */
async function replaceShares(tx: Tx, bill: BillRow, mode: SplitMode, computed: ComputedShare[], actor: BillActor, reason?: string) {
  const live = liveShares(bill);
  if (hasMoney(live)) {
    throw splitHasPayments();
  }
  if (live.length > 0) {
    await tx.tableBillShare.updateMany({ where: { id: { in: live.map((share) => share.id) } }, data: { status: TableShareStatus.VOID } });
  }
  const splitVersion = bill.splitVersion + 1;
  await tx.tableBillShare.createMany({
    data: computed.map((share) => ({
      billId: bill.id,
      splitVersion,
      position: share.position,
      guestId: share.guestId,
      label: share.label,
      amount: share.amount,
    })),
  });
  await bumpBill(tx, bill, { splitMode: mode, splitVersion });
  await recordBillEvent(tx, bill.sessionId, actor, TableSessionEventType.SPLIT_SET, {
    ...(reason ? { reason } : {}),
    after: { mode, splitVersion, shares: computed.map((share) => moneyStr(share.amount)) },
  });
}

/** Whether the current split already is what was asked for (a retried request). */
function sameSplit(bill: BillRow, input: Omit<SplitInput, "expectedVersion">): boolean {
  const live = liveShares(bill);
  if (bill.splitMode !== input.mode || live.length === 0) {
    return false;
  }
  if (input.mode === SplitMode.EQUAL) {
    return input.parts === undefined || live.length === input.parts;
  }
  if (input.mode === SplitMode.CUSTOM) {
    const wanted = input.shares ?? [];
    return wanted.length === live.length && wanted.every((share, i) => live[i]?.amount.equals(share.amount) && (live[i]?.guestId ?? null) === share.guestId);
  }
  return true;
}

/**
 * Any mode, for guests and staff (SA, PA). A CUSTOM split's amounts must add up to the bill exactly (whole
 * rupees except share 1); a guest's custom shares start unclaimed (the validator takes no guest id from a guest).
 */
export function setSplit(sessionId: string, actor: BillActor, input: SplitInput) {
  return writeBill(actor, sessionId, async (tx) => {
    if (actor.kind === "guest" && input.shares?.some((share) => share.guestId !== null)) {
      throw fail(400, "BAD_REQUEST", "A guest can't give a share to someone else");
    }
    const { session, bill, totals } = await openBillForWrite(tx, sessionId, actor);
    if (!bill) {
      throw notRequested();
    }
    if (checkVersion(bill, input.expectedVersion, sameSplit(bill, input)) === "replay") {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    if (totals.awaiting) {
      throw ordersAwaiting();
    }
    if (hasMoney(liveShares(bill))) {
      throw splitHasPayments();
    }
    const computed = await computeSplit(tx, sessionId, bill, totals, input);
    await replaceShares(tx, bill, input.mode, computed, actor);
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

/**
 * BY_ITEMS, guests only, for themselves: "I had some of this shared line" (an item someone else ordered, or
 * one staff added). Recomputes the shares at once.
 */
export function setClaim(
  sessionId: string,
  actor: Extract<BillActor, { kind: "guest" }>,
  input: { lineKind: TableBillLineKind; lineId: string; claimed: boolean; expectedVersion: number },
) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill, totals } = await openBillForWrite(tx, sessionId, actor);
    if (!bill) {
      throw notRequested();
    }
    if (bill.splitMode !== SplitMode.BY_ITEMS) {
      throw fail(409, "NOT_BY_ITEMS", "The bill isn't split by items");
    }
    const owner = totals.orders
      .flatMap((order) =>
        input.lineKind === TableBillLineKind.ITEM
          ? order.items.filter((item) => item.dealOrderLineId === null && item.subtotal.greaterThan(0))
          : order.dealLines,
      )
      .find((line) => line.id === input.lineId);
    if (!owner) {
      throw fail(404, "NOT_FOUND", "That item isn't on this table's bill");
    }
    if (owner.tableGuestId === actor.guestId) {
      throw fail(400, "BAD_REQUEST", "That's your own item — it's already on your share");
    }
    const mine = bill.claims.filter((claim) => claim.guestId === actor.guestId && claim.lineKind === input.lineKind && claim.lineId === input.lineId);
    if (checkVersion(bill, input.expectedVersion, mine.length > 0 === input.claimed) === "replay") {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    if (totals.awaiting) {
      throw ordersAwaiting();
    }
    if (hasMoney(liveShares(bill))) {
      throw splitHasPayments();
    }
    if (input.claimed) {
      await tx.tableBillClaim.create({
        data: { billId: bill.id, splitVersion: bill.splitVersion, lineKind: input.lineKind, lineId: input.lineId, guestId: actor.guestId },
      });
    } else {
      await tx.tableBillClaim.deleteMany({ where: { billId: bill.id, guestId: actor.guestId, lineKind: input.lineKind, lineId: input.lineId } });
    }
    const fresh = await tx.tableBill.findUniqueOrThrow({ where: { id: bill.id }, include: billInclude });
    const computed = await computeSplit(tx, sessionId, fresh, totals, { mode: SplitMode.BY_ITEMS });
    await replaceShares(tx, fresh, SplitMode.BY_ITEMS, computed, actor, input.claimed ? "Claimed a shared item" : "Unclaimed a shared item");
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

/** EQUAL / CUSTOM: a guest takes an unclaimed share ("This is mine"). */
export function claimShare(sessionId: string, actor: Extract<BillActor, { kind: "guest" }>, shareId: string, expectedVersion: number) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill } = await openBillForWrite(tx, sessionId, actor);
    if (!bill) {
      throw notRequested();
    }
    const share = liveShares(bill).find((candidate) => candidate.id === shareId);
    if (!share) {
      throw shareNotFound();
    }
    if (checkVersion(bill, expectedVersion, share.guestId === actor.guestId) === "replay") {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    const taken = await tx.tableBillShare.updateMany({ where: { id: share.id, guestId: null }, data: { guestId: actor.guestId } });
    if (taken.count === 0) {
      throw fail(409, "SHARE_TAKEN", "Someone else already took this share");
    }
    await bumpBill(tx, bill);
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

// ================= Paying a share (guest) =================

/** A share the calling guest may pay now: theirs, of the current split, unpaid or rejected, bill requested. */
function payableShare(bill: BillRow, shareId: string, guestId: string, allowed: TableShareStatus[]) {
  const share = bill.shares.find((candidate) => candidate.id === shareId);
  if (!share) {
    throw shareNotFound();
  }
  if (share.guestId !== guestId) {
    throw fail(403, "NOT_YOUR_SHARE", "This share belongs to someone else. Tap \"This is mine\" on your own share.");
  }
  if (bill.status !== TableBillStatus.REQUESTED || share.splitVersion !== bill.splitVersion || !allowed.includes(share.status)) {
    throw notAwaitingPayment();
  }
  return share;
}

/**
 * CASH: the share is marked "cash requested" and a BILL_CASH call goes to the table's waiter (routing §5.4;
 * once per share). ONLINE: the active payment accounts, to pay outside the system and upload a proof.
 */
export async function payShare(sessionId: string, actor: Extract<BillActor, { kind: "guest" }>, shareId: string, method: PaymentMethod) {
  let raisedCall: Prisma.TableCallGetPayload<{ include: typeof callInclude }> | null = null;
  const result = await writeBill(actor, sessionId, async (tx) => {
    const { session, bill } = await openBillForWrite(tx, sessionId, actor, { requireRequested: false });
    if (!bill) {
      throw notRequested();
    }
    const share = payableShare(bill, shareId, actor.guestId, [TableShareStatus.UNPAID, TableShareStatus.REJECTED]);
    let changed = false;
    if (share.method !== method) {
      await tx.tableBillShare.update({ where: { id: share.id }, data: { method } });
      changed = true;
    }
    if (method === PaymentMethod.CASH) {
      // One waiter call per share: a deterministic request id makes a repeated tap a no-op.
      const clientRequestId = `bill-cash:${share.id}`;
      const existing = await tx.tableCall.findUnique({ where: { clientRequestId }, select: { id: true } });
      if (!existing) {
        raisedCall = await tx.tableCall.create({
          data: {
            sessionId,
            diningAreaId: session.diningAreaId,
            guestId: actor.guestId,
            type: TableCallType.BILL_CASH,
            note: `Cash for ${share.label}: Rs ${share.amount.toFixed(0)}`.slice(0, 80),
            clientRequestId,
            routedToStaffId: await resolveCallTarget(tx, session.waiterStaffId),
          },
          include: callInclude,
        });
        changed = true;
      }
    }
    if (changed) {
      await bumpBill(tx, bill);
    }
    return {
      changed,
      diningAreaId: session.diningAreaId,
      after: async () => {
        if (raisedCall) {
          await emitCallRaised(raisedCall);
        }
      },
    };
  });
  // ONLINE: where to send the money (as GET /api/online/store lists them); CASH: a waiter comes instead.
  const paymentAccounts = method === PaymentMethod.ONLINE ? (await getPublicStore()).paymentAccounts : null;
  return { ...result, paymentAccounts };
}

/**
 * ONLINE: the guest's payment screenshot for their own share, stored like an order's proof (a PAYMENT_PROOF
 * media asset in Postgres, same size/type limits). A new upload replaces (and deletes) the earlier one.
 */
export function attachShareProof(sessionId: string, actor: Extract<BillActor, { kind: "guest" }>, shareId: string, processed: ProcessedMedia) {
  return writeBill(actor, sessionId, async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (session.status !== TableSessionStatus.OPEN) {
      throw notAwaitingPayment();
    }
    const bill = await lockBill(tx, sessionId);
    if (!bill) {
      throw notAwaitingPayment();
    }
    const share = payableShare(bill, shareId, actor.guestId, [TableShareStatus.UNPAID, TableShareStatus.REJECTED, TableShareStatus.PROOF_SUBMITTED]);
    const asset = await tx.mediaAsset.create({
      data: {
        kind: "PAYMENT_PROOF",
        mimeType: processed.mimeType,
        width: processed.width,
        height: processed.height,
        sizeBytes: processed.data.length,
        createdById: null,
        blob: { create: { data: new Uint8Array(processed.data), thumb: processed.thumb ? new Uint8Array(processed.thumb) : null } },
      },
      select: { id: true },
    });
    const updated = await tx.tableBillShare.updateMany({
      where: { id: share.id, status: share.status },
      data: { status: TableShareStatus.PROOF_SUBMITTED, method: PaymentMethod.ONLINE, paymentProofMediaId: asset.id, rejectedReason: null },
    });
    if (updated.count === 0) {
      throw notAwaitingPayment();
    }
    await releaseMediaIfUnreferenced(tx, share.paymentProofMediaId);
    await recordBillEvent(tx, sessionId, actor, TableSessionEventType.SHARE_PROOF, { after: { share: share.position, amount: moneyStr(share.amount) } });
    await bumpBill(tx, bill);
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

// ================= Reception: per-share payments (SA, PA) =================

/** The bill becomes PAID in the transaction that verifies its last share — only if the shares still add up to its total. */
async function markPaidIfComplete(tx: Tx, bill: BillRow, actor: BillActor): Promise<void> {
  const fresh = await tx.tableBill.findUniqueOrThrow({ where: { id: bill.id }, include: billInclude });
  const live = liveShares(fresh);
  if (live.length === 0 || !live.every((share) => share.status === TableShareStatus.VERIFIED)) {
    return;
  }
  const totals = await computeBillTotals(tx, bill.sessionId);
  const sum = live.reduce((acc, share) => acc.plus(share.amount), D(0));
  if (!sum.equals(fresh.total) || !totals.total.equals(fresh.total)) {
    // The server's own invariant: never settle a bill whose shares don't add up to its orders.
    throw new Error(`Table bill ${bill.id}: shares ${sum.toFixed(2)} vs bill ${fresh.total.toFixed(2)} vs orders ${totals.total.toFixed(2)}`);
  }
  const paid = await tx.tableBill.updateMany({ where: { id: bill.id, status: TableBillStatus.REQUESTED }, data: { status: TableBillStatus.PAID, paidAt: new Date() } });
  if (paid.count === 1) {
    await recordBillEvent(tx, bill.sessionId, actor, TableSessionEventType.BILL_PAID, { after: { total: moneyStr(fresh.total) } });
    // The receipt is made now, in the same transaction: a PAID bill can't change any more (order changes and
    // unlock are refused once shares have money), so every guest can see and keep it before staff close.
    await createReceipt(tx, bill.sessionId, live, { status: { not: OrderStatus.CANCELLED } });
  }
}

async function staffShare(tx: Tx, sessionId: string, actor: BillActor, shareId: string) {
  const { session, bill, totals } = await openBillForWrite(tx, sessionId, actor, { requireRequested: false });
  if (!bill) {
    throw notRequested();
  }
  const share = bill.shares.find((candidate) => candidate.id === shareId);
  if (!share) {
    throw shareNotFound();
  }
  return { session, bill, totals, share, current: share.splitVersion === bill.splitVersion && share.status !== TableShareStatus.VOID };
}

/** Cash collected at the table: UNPAID / PROOF_SUBMITTED / REJECTED → VERIFIED. paidAmount (optional) ≥ amount; change is computed. */
export function markSharePaid(sessionId: string, actor: Extract<BillActor, { kind: "staff" }>, shareId: string, paidAmount: Decimal | null) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill, totals, share, current } = await staffShare(tx, sessionId, actor, shareId);
    if (current && share.status === TableShareStatus.VERIFIED) {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    const payable = [TableShareStatus.UNPAID, TableShareStatus.PROOF_SUBMITTED, TableShareStatus.REJECTED] as TableShareStatus[];
    if (!current || bill.status !== TableBillStatus.REQUESTED || !payable.includes(share.status)) {
      throw notAwaitingPayment();
    }
    if (totals.awaiting) {
      throw ordersAwaiting();
    }
    if (paidAmount !== null && (paidAmount.lessThan(share.amount) || paidAmount.decimalPlaces() > 2)) {
      throw fail(400, "BAD_REQUEST", `paidAmount must be at least ${moneyStr(share.amount)}`);
    }
    const updated = await tx.tableBillShare.updateMany({
      where: { id: share.id, status: share.status },
      data: { status: TableShareStatus.VERIFIED, method: PaymentMethod.CASH, paidAmount, verifiedById: actor.id, verifiedAt: new Date(), rejectedReason: null },
    });
    if (updated.count === 0) {
      throw notAwaitingPayment();
    }
    await recordBillEvent(tx, sessionId, actor, TableSessionEventType.SHARE_PAID, {
      after: { share: share.position, amount: moneyStr(share.amount), ...(paidAmount ? { paidAmount: moneyStr(paidAmount) } : {}) },
    });
    await markPaidIfComplete(tx, bill, actor);
    await bumpBill(tx, bill);
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

/** An online proof checked and found: PROOF_SUBMITTED → VERIFIED. */
export function verifyShare(sessionId: string, actor: Extract<BillActor, { kind: "staff" }>, shareId: string) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill, totals, share, current } = await staffShare(tx, sessionId, actor, shareId);
    if (current && share.status === TableShareStatus.VERIFIED) {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    if (!current || bill.status !== TableBillStatus.REQUESTED || share.status !== TableShareStatus.PROOF_SUBMITTED) {
      throw fail(409, "NOT_AWAITING_VERIFICATION", "This share has no payment proof waiting to be checked");
    }
    if (totals.awaiting) {
      throw ordersAwaiting();
    }
    const updated = await tx.tableBillShare.updateMany({
      where: { id: share.id, status: TableShareStatus.PROOF_SUBMITTED },
      data: { status: TableShareStatus.VERIFIED, verifiedById: actor.id, verifiedAt: new Date() },
    });
    if (updated.count === 0) {
      throw fail(409, "NOT_AWAITING_VERIFICATION", "This share has no payment proof waiting to be checked");
    }
    await recordBillEvent(tx, sessionId, actor, TableSessionEventType.SHARE_VERIFIED, { after: { share: share.position, amount: moneyStr(share.amount) } });
    await markPaidIfComplete(tx, bill, actor);
    await bumpBill(tx, bill);
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

/** The proof doesn't show the payment: PROOF_SUBMITTED → REJECTED, with a reason the guest sees. They may upload again. */
export function rejectShare(sessionId: string, actor: Extract<BillActor, { kind: "staff" }>, shareId: string, reason: string) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill, share, current } = await staffShare(tx, sessionId, actor, shareId);
    if (current && share.status === TableShareStatus.REJECTED) {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    if (!current || share.status !== TableShareStatus.PROOF_SUBMITTED) {
      throw fail(409, "NOT_AWAITING_VERIFICATION", "This share has no payment proof waiting to be checked");
    }
    const updated = await tx.tableBillShare.updateMany({
      where: { id: share.id, status: TableShareStatus.PROOF_SUBMITTED },
      data: { status: TableShareStatus.REJECTED, rejectedReason: reason },
    });
    if (updated.count === 0) {
      throw fail(409, "NOT_AWAITING_VERIFICATION", "This share has no payment proof waiting to be checked");
    }
    await recordBillEvent(tx, sessionId, actor, TableSessionEventType.SHARE_REJECTED, { reason, after: { share: share.position } });
    await bumpBill(tx, bill);
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

/** Marked paid by mistake: VERIFIED → UNPAID, with a reason. Not once the bill is PAID. */
export function unmarkShare(sessionId: string, actor: Extract<BillActor, { kind: "staff" }>, shareId: string, reason: string) {
  return writeBill(actor, sessionId, async (tx) => {
    const { session, bill, share, current } = await staffShare(tx, sessionId, actor, shareId);
    if (current && share.status === TableShareStatus.UNPAID) {
      return { changed: false, diningAreaId: session.diningAreaId };
    }
    if (bill.status === TableBillStatus.PAID) {
      throw fail(409, "BILL_PAID", "This bill is already paid");
    }
    if (!current || share.status !== TableShareStatus.VERIFIED) {
      throw fail(409, "NOT_VERIFIED", "Only a paid share can be unmarked");
    }
    const updated = await tx.tableBillShare.updateMany({
      where: { id: share.id, status: TableShareStatus.VERIFIED },
      data: { status: TableShareStatus.UNPAID, paidAmount: null, verifiedById: null, verifiedAt: null },
    });
    if (updated.count === 0) {
      throw fail(409, "NOT_VERIFIED", "Only a paid share can be unmarked");
    }
    await recordBillEvent(tx, sessionId, actor, TableSessionEventType.SHARE_UNMARKED, { reason, after: { share: share.position } });
    await bumpBill(tx, bill);
    return { changed: true, diningAreaId: session.diningAreaId };
  });
}

/** The proof image of a share (staff only, never public). Null when there is none or the share isn't this session's. */
export async function getShareProofId(sessionId: string, shareId: string): Promise<string | null> {
  const share = await prisma.tableBillShare.findFirst({
    where: { id: shareId, bill: { sessionId } },
    select: { paymentProofMediaId: true },
  });
  return share?.paymentProofMediaId ?? null;
}

// ================= Close, with settlement and the receipt (spec §7.5, §7.6) =================

const OPEN_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.AWAITING_RECEPTION,
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
];

function addOnNames(raw: unknown): string[] {
  return Array.isArray(raw)
    ? raw.filter((entry): entry is { name: unknown } => typeof entry === "object" && entry !== null && "name" in entry).map((entry) => String(entry.name))
    : [];
}

/**
 * Built once — when the bill becomes PAID, or at close for a table paid order by order — and never recomputed.
 * No staff names, phone numbers, proofs, account numbers or discount reasons.
 */
async function buildReceiptSnapshot(tx: Tx, sessionId: string, shares: ShareRow[], orderWhere: Prisma.OrderWhereInput) {
  const [session, settings] = await Promise.all([
    tx.tableSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        seatedAt: true,
        diningArea: { select: { name: true, area: true } },
        businessDay: { select: { label: true } },
        orders: {
          where: orderWhere,
          orderBy: { orderNumber: "asc" },
          select: {
            orderNumber: true,
            discount: true,
            totalAmount: true,
            tableGuest: { select: { displayName: true } },
            items: {
              where: { dealOrderLineId: null },
              select: { quantity: true, subtotal: true, variantLabel: true, addOns: true, menuItem: { select: { name: true, nameUr: true } } },
            },
            dealLines: { select: { quantity: true, subtotal: true, dealName: true, deal: { select: { nameUr: true } } } },
          },
        },
      },
    }),
    getSiteSettings(),
  ]);
  // The orders' items (deal-exploded ones excluded above) + deal lines, before discount.
  const subtotal = session.orders.reduce(
    (sum, order) => order.dealLines.reduce((acc, line) => acc.plus(line.subtotal), order.items.reduce((acc, item) => acc.plus(item.subtotal), sum)),
    D(0),
  );
  const discount = session.orders.reduce((sum, order) => sum.plus(order.discount), D(0));
  const total = session.orders.reduce((sum, order) => sum.plus(order.totalAmount), D(0));
  return {
    total,
    snapshot: {
      shop: { nameEn: settings.shopNameEn, nameUr: settings.shopNameUr, addressEn: settings.addressEn, phone: settings.phone },
      table: { name: session.diningArea.name, area: session.diningArea.area },
      seatedAt: session.seatedAt.toISOString(),
      // When the receipt was made: the moment the bill was paid (or the table closed, without a bill).
      issuedAt: new Date().toISOString(),
      businessDayLabel: session.businessDay.label,
      orders: session.orders.map((order) => ({
        orderNumber: order.orderNumber,
        guestName: order.tableGuest?.displayName ?? null,
        lines: [
          ...order.items.map((item) => ({
            name: item.menuItem.name,
            nameUr: item.menuItem.nameUr,
            size: item.variantLabel,
            addOns: addOnNames(item.addOns),
            quantity: item.quantity,
            lineTotal: moneyStr(item.subtotal),
          })),
          ...order.dealLines.map((line) => ({
            name: line.dealName,
            nameUr: line.deal?.nameUr ?? null,
            size: null,
            addOns: [] as string[],
            quantity: line.quantity,
            lineTotal: moneyStr(line.subtotal),
          })),
        ],
      })),
      subtotal: moneyStr(subtotal),
      discount: moneyStr(discount),
      total: moneyStr(total),
      shares: shares.map((share) => ({ label: share.label, amount: moneyStr(share.amount), method: share.method })),
      taxInvoiceNumber: null,
      taxAuthority: null,
      isDemo: settings.isDemo === true,
    },
  };
}

/**
 * Close a table (SA, PA, OT). With a PAID bill: every billable order is marked paid through the bill and
 * completed, in one transaction. Without a bill (or with an unlocked one): the phase-1 rule, every order
 * already completed or cancelled. A requested-but-unpaid bill refuses (BILL_NOT_PAID). Either way the
 * session ends, so every guest token dies, open calls are cancelled, and a receipt with a long random link
 * is made when anything was paid. Closing an already closed table answers the same result again.
 */
export async function closeTable(sessionId: string, actorId: string) {
  const outcome = await prisma.$transaction(async (tx) => {
    const session = await lockSession(tx, sessionId);
    if (session.status === TableSessionStatus.CLOSED) {
      return { replay: true as const };
    }
    if (session.status !== TableSessionStatus.OPEN) {
      throw sessionNotOpen();
    }
    const bill = await lockBill(tx, sessionId);
    if (bill?.status === TableBillStatus.REQUESTED) {
      throw fail(409, "BILL_NOT_PAID", "This table's bill isn't fully paid yet");
    }
    let completed: Awaited<ReturnType<typeof settleTableOrdersInTransaction>> = [];
    let receiptShares: ShareRow[] = [];
    if (bill?.status === TableBillStatus.PAID) {
      const totals = await computeBillTotals(tx, sessionId);
      if (totals.awaiting) {
        throw ordersAwaiting();
      }
      if (!totals.total.equals(bill.total)) {
        throw billChanged(bill.version);
      }
      receiptShares = liveShares(bill);
      const allOnline = receiptShares.length > 0 && receiptShares.every((share) => share.method === PaymentMethod.ONLINE);
      completed = await settleTableOrdersInTransaction(tx, sessionId, { actorId, paymentMethod: allOnline ? PaymentMethod.ONLINE : PaymentMethod.CASH });
    } else {
      const open = await tx.order.findMany({
        where: { tableSessionId: sessionId, status: { in: OPEN_ORDER_STATUSES } },
        select: { id: true, orderNumber: true, status: true },
      });
      if (open.length > 0) {
        throw fail(409, "SESSION_HAS_OPEN_ORDERS", "Complete or cancel this table's open orders first", { orderIds: open.map((o) => o.id), openOrders: open });
      }
    }
    const closed = await tx.tableSession.updateMany({
      where: { id: sessionId, status: TableSessionStatus.OPEN },
      data: { status: TableSessionStatus.CLOSED, closedAt: new Date(), closedById: actorId, version: { increment: 1 } },
    });
    if (closed.count === 0) {
      throw sessionNotOpen();
    }
    await recordBillEvent(tx, sessionId, { kind: "staff", id: actorId, role: StaffRole.POS_ADMIN }, TableSessionEventType.CLOSED);
    const cancelledCalls = await cancelOpenCallsInTransaction(tx, sessionId);
    // A paid bill already made its receipt (createReceipt is a no-op then); a table paid order by order
    // gets one now if anything was paid.
    const paidWhere = { status: { not: OrderStatus.CANCELLED }, paymentStatus: PaymentStatus.VERIFIED };
    const paidOrders = await tx.order.count({ where: { tableSessionId: sessionId, ...paidWhere } });
    let receiptKey: string | null = null;
    if (paidOrders > 0) {
      receiptKey = await createReceipt(tx, sessionId, receiptShares, paidWhere);
    }
    return { replay: false as const, diningAreaId: session.diningAreaId, completed, cancelledCalls, receiptKey, hasBill: bill !== null };
  });

  if (!outcome.replay) {
    await announceTableOrdersCompleted(outcome.completed);
    await emitCallsCancelled(outcome.cancelledCalls);
    emitToFloor("table-session:updated", { sessionId, diningAreaId: outcome.diningAreaId, status: TableSessionStatus.CLOSED });
    await emitTableUpdated(outcome.diningAreaId);
    if (outcome.hasBill) {
      await emitTableBillUpdated(sessionId);
    }
  }
  const session = await prisma.tableSession.findUniqueOrThrow({
    where: { id: sessionId },
    select: { id: true, diningAreaId: true, status: true, closedAt: true, receipt: { select: { receiptKey: true } } },
  });
  const { receipt, ...rest } = session;
  return { session: rest, receiptKey: receipt?.receiptKey ?? null };
}

/** Writes the session's one receipt with a new long random link; a no-op when it already has one. */
async function createReceipt(tx: Tx, sessionId: string, shares: ShareRow[], orderWhere: Prisma.OrderWhereInput): Promise<string> {
  const existing = await tx.tableReceipt.findUnique({ where: { sessionId }, select: { receiptKey: true } });
  if (existing) {
    return existing.receiptKey;
  }
  const { snapshot, total } = await buildReceiptSnapshot(tx, sessionId, shares, { tableSessionId: sessionId, ...orderWhere });
  const receiptKey = generateGuestToken(); // 32 random bytes, base64url: the same strength as a guest token
  await tx.tableReceipt.create({ data: { sessionId, receiptKey, snapshot, total } });
  return receiptKey;
}

// ================= Receipts =================

const RECEIPT_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** GET /api/online/receipts/:receiptKey — the public snapshot, or null (malformed and unknown look the same). */
export async function getPublicReceipt(receiptKey: string) {
  if (!RECEIPT_KEY_PATTERN.test(receiptKey)) {
    return null;
  }
  const receipt = await prisma.tableReceipt.findUnique({ where: { receiptKey }, select: { snapshot: true } });
  return receipt?.snapshot ?? null;
}

/** Staff: the session's receipt with its link, or null before the table is closed. */
export async function getSessionReceipt(sessionId: string) {
  const receipt = await prisma.tableReceipt.findUnique({ where: { sessionId }, select: { receiptKey: true, snapshot: true } });
  return receipt ? { receiptKey: receipt.receiptKey, receipt: receipt.snapshot } : null;
}

/**
 * The receipt link for a guest whose token just died because the table was closed: the phone keeps it after
 * the session ends (spec §6.3). Only for a guest of that session staff didn't remove.
 */
export async function receiptKeyForToken(token: string): Promise<string | null> {
  const guest = await prisma.tableGuest.findUnique({
    where: { tokenHash: hashGuestToken(token) },
    select: { revokedAt: true, session: { select: { status: true, receipt: { select: { receiptKey: true } } } } },
  });
  if (!guest || guest.revokedAt !== null || guest.session.status !== TableSessionStatus.CLOSED) {
    return null;
  }
  return guest.session.receipt?.receiptKey ?? null;
}
