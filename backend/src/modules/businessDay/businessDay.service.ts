import { OrderStatus } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

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
  const orders = await prisma.order.findMany({
    where: { businessDayId, status: { in: BLOCKING_STATUSES } },
    select: { id: true },
  });
  return orders.map((order) => order.id);
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
