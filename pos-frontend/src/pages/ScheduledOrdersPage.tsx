import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../api/errors";
import type { OrderDetail } from "../api/orders";
import { LineNote } from "../components/LineNote";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { Button, ConfirmDialog, EmptyState, Modal, PageHeader } from "../components/ui";
import {
  useCancelScheduledOrder,
  useReleaseScheduledOrder,
  useRescheduleOrder,
  useScheduledOrders,
} from "../hooks/useOrders";
import { ORDER_TYPE_LABEL } from "../lib/enumLabels";
import { formatMoney } from "../lib/format";
import type { WallTime } from "../lib/shopTime";
import { formatTimeUntil, fromWallTime, toWallTime } from "../lib/shopTime";
import { SchedulePicker } from "./newOrder/SchedulePicker";
import { scheduleError } from "./newOrder/schedule";

type PendingAction = { kind: "release" | "cancel"; order: OrderDetail };

function EditTimeDialog({ order, onClose }: { order: OrderDetail; onClose: () => void }) {
  const rescheduleMutation = useRescheduleOrder();
  const [value, setValue] = useState<WallTime>(() => toWallTime(new Date(order.scheduledFor ?? Date.now())));
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const problem = scheduleError(value, new Date());
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    try {
      await rescheduleMutation.mutateAsync({ id: order.id, scheduledFor: fromWallTime(value).toISOString() });
      onClose();
    } catch (saveError) {
      setError(getApiErrorMessage(saveError, "Failed to change the time"));
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Change time — order #${order.orderNumber}`}>
      <div className="flex flex-col gap-4">
        <SchedulePicker idPrefix={`reschedule-${order.id}`} value={value} onChange={setValue} />
        {error && (
          <p role="alert" className="text-body text-status-danger-text">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleSave} disabled={rescheduleMutation.isPending}>
            {rescheduleMutation.isPending ? "Saving…" : "Save time"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ScheduledOrderCard({
  order,
  now,
  onEditTime,
  onAction,
}: {
  order: OrderDetail;
  now: Date;
  onEditTime: () => void;
  onAction: (kind: PendingAction["kind"]) => void;
}) {
  const navigate = useNavigate();
  const directItems = order.items.filter((item) => item.dealOrderLineId === null);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/orders/${order.id}`} className="text-body font-semibold text-ink no-underline hover:underline">
            Order #{order.orderNumber}
          </Link>
          <OrderStatusBadge order={order} />
        </div>
        {order.scheduledFor && (
          <span className="text-meta font-medium text-ink-muted">{formatTimeUntil(order.scheduledFor, now)}</span>
        )}
      </div>

      <div className="flex flex-col gap-0.5 text-body text-ink">
        <span>
          {ORDER_TYPE_LABEL[order.type]}
          {order.diningArea ? ` — ${order.diningArea.name}` : ""}
        </span>
        {order.deliveryAddress && <span className="text-meta text-ink-muted">{order.deliveryAddress}</span>}
        {order.placedByStaff && <span className="text-meta text-ink-muted">Placed by {order.placedByStaff.name}</span>}
      </div>

      <ul className="flex list-none flex-col gap-1 text-body text-ink">
        {directItems.map((item) => (
          <li key={item.id}>
            {item.quantity}× {item.menuItem.name}
            {item.variantLabel && <span className="text-meta text-ink-muted"> · {item.variantLabel}</span>}
            {item.addOns && item.addOns.length > 0 && (
              <span className="text-meta text-ink-muted"> (+ {item.addOns.map((addOn) => addOn.name).join(", ")})</span>
            )}
            {item.notes && <LineNote notes={item.notes} className="ml-4" />}
          </li>
        ))}
        {order.dealLines.map((line) => (
          <li key={line.id}>
            {line.quantity}× {line.dealName}
            {line.customization && <span className="text-meta text-ink-muted"> (customized)</span>}
            {line.notes && <LineNote notes={line.notes} className="ml-4" />}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between border-t border-border pt-2 text-body font-semibold text-ink">
        <span>Total</span>
        <span className="text-numeric">{formatMoney(order.totalAmount)}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <Button variant="secondary" onClick={onEditTime}>
          Edit time
        </Button>
        <Button variant="secondary" onClick={() => navigate(`/scheduled/${order.id}/edit`)}>
          Edit items
        </Button>
        <Button variant="success" onClick={() => onAction("release")}>
          Release now
        </Button>
        <Button variant="danger" onClick={() => onAction("cancel")}>
          Cancel order
        </Button>
      </div>
    </div>
  );
}

// POS admin's list of orders on hold ("Schedule for later"), soonest first. Each is released
// to Incoming orders automatically at its time by the server; from here it can be re-timed,
// re-itemed, released early, or cancelled — every action 409s (and the list refreshes) if
// it was released in the meantime.
// Fills the space left under the page header and centres its child there, then nudges the child so
// its middle sits at the middle of the viewport (the top bar and page header would otherwise pull
// it low). The nudge never pushes the child out of the space it was given.
function CenteredInViewport({ children }: { children: ReactNode }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const area = areaRef.current;
    const child = area?.firstElementChild as HTMLElement | null;
    if (!area || !child) {
      return;
    }
    function measure() {
      if (!area || !child) {
        return;
      }
      const areaBox = area.getBoundingClientRect();
      const childHeight = child.offsetHeight;
      const wanted = window.innerHeight / 2 - (areaBox.top + areaBox.height / 2);
      const room = (areaBox.height - childHeight) / 2;
      setShift(Math.max(-room, Math.min(room, wanted)));
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <div ref={areaRef} className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-md" style={{ transform: `translateY(${shift}px)` }}>
        {children}
      </div>
    </div>
  );
}

export function ScheduledOrdersPage() {
  const { data: orders, isLoading, isError } = useScheduledOrders();
  const releaseMutation = useReleaseScheduledOrder();
  const cancelMutation = useCancelScheduledOrder();
  const [editingTimeFor, setEditingTimeFor] = useState<OrderDetail | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  async function handleConfirm() {
    if (!pending) {
      return;
    }
    setActionError(null);
    try {
      if (pending.kind === "release") {
        await releaseMutation.mutateAsync(pending.order.id);
      } else {
        await cancelMutation.mutateAsync({ id: pending.order.id });
      }
      setPending(null);
    } catch (error) {
      setActionError(getApiErrorMessage(error, pending.kind === "release" ? "Failed to release" : "Failed to cancel"));
    }
  }

  return (
    // min-h-full lets the empty state below take the rest of the screen and centre itself in it.
    <div className="flex min-h-full flex-col gap-6">
      <PageHeader
        title="Scheduled orders"
        description={
          <span className="text-card-head font-medium text-ink-soft">
            On hold until their time (Pakistan time), then sent to Incoming orders automatically.
          </span>
        }
      />

      {isLoading && <p className="text-body text-ink-muted">Loading scheduled orders…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load scheduled orders.</p>}

      {orders && orders.length === 0 && (
        <CenteredInViewport>
          <EmptyState
            title="No scheduled orders"
            description='Choose "Schedule for later" when placing an order to hold it until a set time.'
          />
        </CenteredInViewport>
      )}

      {orders && orders.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {orders.map((order) => (
            <ScheduledOrderCard
              key={order.id}
              order={order}
              now={now}
              onEditTime={() => setEditingTimeFor(order)}
              onAction={(kind) => {
                setActionError(null);
                setPending({ kind, order });
              }}
            />
          ))}
        </div>
      )}

      {editingTimeFor && <EditTimeDialog key={editingTimeFor.id} order={editingTimeFor} onClose={() => setEditingTimeFor(null)} />}

      <ConfirmDialog
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={handleConfirm}
        title={pending?.kind === "release" ? "Release now?" : "Cancel this scheduled order?"}
        message={
          pending?.kind === "release"
            ? `Order #${pending.order.orderNumber} goes to Incoming orders right away, ahead of its scheduled time. Reception then sends it to the kitchen as usual.`
            : `Order #${pending?.order.orderNumber} will be cancelled. It never reached a kitchen and used no stock.`
        }
        confirmLabel={pending?.kind === "release" ? "Release now" : "Cancel order"}
        cancelLabel="Keep it scheduled"
        confirmVariant={pending?.kind === "release" ? "success" : "danger"}
        confirmingLabel={pending?.kind === "release" ? "Releasing…" : "Cancelling…"}
        isConfirming={releaseMutation.isPending || cancelMutation.isPending}
        error={actionError}
      />
    </div>
  );
}
