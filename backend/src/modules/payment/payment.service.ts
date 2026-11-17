import { PaymentStatus, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

export class OrderNotFoundError extends Error {}
export class PaymentNotAwaitingVerificationError extends Error {}

export function listPendingPayments() {
  return prisma.order.findMany({
    where: { paymentStatus: PaymentStatus.AWAITING_VERIFICATION },
    orderBy: { createdAt: "asc" },
  });
}

async function requireAwaitingVerification(orderId: string) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new OrderNotFoundError();
  }
  if (order.paymentStatus !== PaymentStatus.AWAITING_VERIFICATION) {
    throw new PaymentNotAwaitingVerificationError();
  }
  return order;
}

// Payment fields only. It must NOT touch Order.status: an order still at reception
// (AWAITING_RECEPTION) has to stay in the Incoming inbox until reception accepts it — moving it to
// CONFIRMED here would drop it out of the inbox and into the kitchen queue with no stock deduction.
// Accepting (POST /orders/:id/accept) is the only thing that moves an order on.
export async function verifyPayment(orderId: string, paymentVerifiedById: string) {
  await requireAwaitingVerification(orderId);

  return prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: PaymentStatus.VERIFIED,
      paymentVerifiedById,
    },
  });
}

export async function rejectPayment(orderId: string) {
  await requireAwaitingVerification(orderId);

  return prisma.order.update({
    where: { id: orderId },
    data: { paymentStatus: PaymentStatus.REJECTED },
  });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}
