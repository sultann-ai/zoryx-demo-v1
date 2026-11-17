import type { OrderEvent, OrderEventType } from "../../api/orders";
import { getApiErrorMessage } from "../../api/errors";
import { Card } from "../../components/ui";
import { useOrderEvents } from "../../hooks/useOrders";
import { formatDateTime, formatMoney } from "../../lib/format";

const ACTION_LABEL: Record<OrderEventType, string> = {
  CANCELLED: "Cancelled",
  DISCOUNT_SET: "Discount",
  PAYMENT_MARKED: "Marked paid",
  PAYMENT_UNMARKED: "Marked unpaid",
  ITEM_REMOVED: "Item removed",
  ITEM_ADDED: "Item added",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
};

function moneyField(snapshot: Record<string, unknown> | null, key: string): string | null {
  const value = snapshot?.[key];
  return typeof value === "string" ? formatMoney(value) : null;
}

// The one line under the action that says what changed: money as "before → after", an item by
// name, and "after payment" on a cancellation of a paid order.
function eventDetail(event: OrderEvent): string | null {
  const { before, after } = event;
  switch (event.type) {
    case "DISCOUNT_SET": {
      const from = moneyField(before, "discount");
      const to = moneyField(after, "discount");
      const total = moneyField(after, "totalAmount");
      return from && to ? `${from} → ${to}${total ? ` (total ${total})` : ""}` : null;
    }
    case "ITEM_REMOVED": {
      const from = moneyField(before, "totalAmount");
      const to = moneyField(after, "totalAmount");
      const item = typeof before?.item === "string" ? before.item : "";
      return `${item}${from && to ? ` · total ${from} → ${to}` : ""}`;
    }
    case "ITEM_ADDED": {
      const from = moneyField(before, "totalAmount");
      const to = moneyField(after, "totalAmount");
      const items = Array.isArray(after?.items) ? after.items.join(", ") : "";
      return `${items}${from && to ? ` · total ${from} → ${to}` : ""}`;
    }
    case "PAYMENT_MARKED": {
      const paid = moneyField(after, "paidAmount");
      const total = moneyField(after, "totalAmount");
      return [total && `total ${total}`, paid && `paid ${paid}`].filter(Boolean).join(" · ") || null;
    }
    case "CANCELLED": {
      const total = moneyField(before, "totalAmount");
      const paid = before?.paid === true ? "after payment" : null;
      const restocked = after?.restocked === true ? "stock returned" : null;
      return [total, paid, restocked].filter(Boolean).join(" · ") || null;
    }
    default:
      return null;
  }
}

// Compact audit trail at the foot of the order: when (Pakistan time), who, what, why.
export function OrderHistory({ orderId, orderUpdatedAt }: { orderId: string; orderUpdatedAt: string }) {
  const { data: events, isLoading, isError, error } = useOrderEvents(orderId, orderUpdatedAt);

  return (
    <Card title="History" className="max-w-2xl">
      {isLoading && <p className="text-body text-ink-muted">Loading history…</p>}
      {isError && (
        <p role="alert" className="text-body text-status-danger-text">
          {getApiErrorMessage(error, "Could not load the history.")}
        </p>
      )}
      {events && events.length === 0 && <p className="text-body text-ink-muted">Nothing recorded yet.</p>}
      {events && events.length > 0 && (
        <ol className="flex flex-col divide-y divide-border">
          {events.map((event) => {
            const detail = eventDetail(event);
            return (
              <li key={event.id} className="flex flex-col gap-0.5 py-2 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-body font-medium text-ink">
                    {ACTION_LABEL[event.type]}
                    <span className="font-normal text-ink-muted"> · {event.actorName ?? "System"}</span>
                  </span>
                  <span className="text-meta text-ink-muted">{formatDateTime(event.createdAt)}</span>
                </div>
                {detail && <span className="text-meta text-ink-muted">{detail}</span>}
                {event.reason && <span className="break-words text-meta text-ink">Reason: {event.reason}</span>}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
