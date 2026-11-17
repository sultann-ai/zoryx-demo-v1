import { OrderStatus, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { UNPAID_ORDER_WHERE } from "../reports/salesDefinitions";

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
