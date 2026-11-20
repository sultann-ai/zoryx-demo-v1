import { OrderStatus, PaymentStatus, Prisma, TableSessionStatus } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { UNPAID_ORDER_WHERE } from "../reports/salesDefinitions";
import { announceDayEndCloses, closeIdleSessionsForDayEnd, isIdleForDayEnd } from "../table/tableBill.service";
import { emitTablesUpdated } from "../table/tableNotify";

const BLOCKING_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  // An accepted online/guest order that hasn't been marked delivered yet. COMPLETED (delivered) is
  // finished and counted everywhere, and never blocks.
  OrderStatus.CONFIRMED,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
  // Waiting at reception isn't "real" yet, but it's not nothing either — ending the day
  // would strand it with no active business day to ever be accepted into.
  OrderStatus.AWAITING_RECEPTION,
];

export function getActiveBusinessDay() {
  return prisma.businessDay.findFirst({ where: { isActive: true } });
}

export function startBusinessDay(openedById: string, label: string) {
  return prisma.businessDay.create({
    data: {
      label,
      startedAt: new Date(),
      openedById,
    },
  });
}

export async function getBlockingOrderIds(businessDayId: string): Promise<string[]> {
  return (await getBlockingOrders(businessDayId)).map((order) => order.id);
}

// The open orders that stop the day ending, with what the End Day dialog needs to finish each one
// right there (Complete, or Cancel): number, status, type, payment, amount.
export function getBlockingOrders(businessDayId: string) {
  return prisma.order.findMany({
    where: { businessDayId, status: { in: BLOCKING_STATUSES } },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      type: true,
      source: true,
      paymentMethod: true,
      paymentStatus: true,
      totalAmount: true,
      diningArea: { select: { name: true } },
    },
    orderBy: { orderNumber: "asc" },
  });
}

// Accepted orders on this day that nobody has marked paid (salesDefinitions' "unpaid") — they are
// not in the day's sales. Listed, by number and amount, before staff may end the day anyway.
export async function getUnpaidOrders(businessDayId: string) {
  const orders = await prisma.order.findMany({
    where: { businessDayId, ...UNPAID_ORDER_WHERE },
    select: { id: true, orderNumber: true, totalAmount: true, status: true, paymentMethod: true },
    orderBy: { orderNumber: "asc" },
  });
  const total = orders.reduce((sum, order) => sum.plus(order.totalAmount), new Prisma.Decimal(0));
  return { orders, total };
}

export function endBusinessDay(businessDayId: string, closedById: string) {
  return prisma.businessDay.update({
    where: { id: businessDayId },
    data: {
      isActive: false,
      endedAt: new Date(),
      closedById,
    },
  });
}

/**
 * End Day with force (table sync R6): in the same transaction as the day end, every table of the day that
 * owes nothing is closed; the rest stay open as "from the previous day" until staff settle or close them.
 */
export async function endBusinessDayForced(businessDayId: string, closedById: string) {
  const outcome = await prisma.$transaction(async (tx) => {
    const tables = await closeIdleSessionsForDayEnd(tx, businessDayId, closedById);
    const businessDay = await tx.businessDay.update({
      where: { id: businessDayId },
      data: { isActive: false, endedAt: new Date(), closedById },
    });
    return { businessDay, tables };
  });
  await announceDayEndCloses(outcome.tables.closed);
  // The ones left open now read PREVIOUS_DAY on the map.
  await emitTablesUpdated(
    (
      await prisma.tableSession.findMany({
        where: { id: { in: outcome.tables.leftOpen.map((entry) => entry.sessionId) } },
        select: { diningAreaId: true },
      })
    ).map((session) => session.diningAreaId),
  );
  return {
    ...outcome.businessDay,
    closedTableSessions: outcome.tables.closed.map(({ sessionId, tableName }) => ({ id: sessionId, tableName })),
    leftOpenTableSessions: outcome.tables.leftOpen.map(({ sessionId, tableName }) => ({ id: sessionId, tableName })),
  };
}

// Table QR: tables still seated on this day (they block ending it, without force). Table sync R6: each says
// what it still owes and whether a forced end would close it by itself (canClose).
export async function getOpenTableSessions(businessDayId: string) {
  const sessions = await prisma.tableSession.findMany({
    where: { businessDayId, status: TableSessionStatus.OPEN, mergedIntoSessionId: null },
    select: {
      id: true,
      seatedAt: true,
      diningArea: { select: { name: true, area: true } },
      _count: { select: { orders: true } },
      orders: { where: { status: { not: OrderStatus.CANCELLED }, paymentStatus: { not: PaymentStatus.VERIFIED } }, select: { totalAmount: true } },
    },
    orderBy: { seatedAt: "asc" },
  });
  const result = [];
  for (const session of sessions) {
    result.push({
      id: session.id,
      table: session.diningArea,
      seatedAt: session.seatedAt,
      orderCount: session._count.orders,
      owed: session.orders.reduce((sum, order) => sum.plus(order.totalAmount), new Prisma.Decimal(0)).toFixed(2),
      canClose: await isIdleForDayEnd(prisma, session.id),
    });
  }
  return result;
}
