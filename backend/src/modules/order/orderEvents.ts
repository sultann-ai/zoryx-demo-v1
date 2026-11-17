import { OrderEventType, Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";

// The order audit trail (OrderEvent). Every action in OrderEventType writes exactly one row through
// recordOrderEvent, passing the SAME transaction client as the change it describes — so an action
// and its record commit or roll back together. Nothing updates or deletes an event afterwards.

export const ORDER_EVENT_REASON_MAX_LENGTH = 200;

// Money goes in as strings (like the API), so before/after read the same in the History list.
export type OrderEventSnapshot = Record<string, string | number | boolean | null | string[]>;

export interface OrderEventInput {
  orderId: string;
  // Null for something no staff member did (a guest, a system job).
  actorId: string | null;
  type: OrderEventType;
  reason?: string | null;
  before?: OrderEventSnapshot;
  after?: OrderEventSnapshot;
}

// Long free-text reasons from older paths (e.g. a reception rejection) are cut to fit the column
// rather than failing the action they describe; the full text still lives on the order itself.
function fitReason(reason: string | null | undefined): string | null {
  if (reason === undefined || reason === null) {
    return null;
  }
  const trimmed = reason.trim();
  if (trimmed === "") {
    return null;
  }
  return trimmed.length > ORDER_EVENT_REASON_MAX_LENGTH ? trimmed.slice(0, ORDER_EVENT_REASON_MAX_LENGTH) : trimmed;
}

export function recordOrderEvent(tx: Prisma.TransactionClient, input: OrderEventInput) {
  return tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      actorId: input.actorId,
      type: input.type,
      reason: fitReason(input.reason),
      ...(input.before !== undefined ? { before: input.before } : {}),
      ...(input.after !== undefined ? { after: input.after } : {}),
    },
  });
}

export async function listOrderEvents(orderId: string) {
  const events = await prisma.orderEvent.findMany({
    where: { orderId },
    include: { actor: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return events.map((event) => ({
    id: event.id,
    type: event.type,
    reason: event.reason,
    before: event.before,
    after: event.after,
    createdAt: event.createdAt,
    actorId: event.actorId,
    actorName: event.actor?.name ?? null,
  }));
}

export const money = (value: Prisma.Decimal | null | undefined): string | null => (value == null ? null : value.toFixed(2));
