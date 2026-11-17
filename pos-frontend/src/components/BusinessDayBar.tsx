import { useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { ApiErrorBody } from "../api/errors";
import { getApiErrorBody, getApiErrorMessage, getApiErrorStatus } from "../api/errors";
import { useAuth } from "../context/AuthContext";
import { useCurrentBusinessDay, useEndBusinessDay, useStartBusinessDay } from "../hooks/useBusinessDay";
import { useCancelOrder, useCancelScheduledOrder, useReleaseScheduledOrder } from "../hooks/useOrders";
import { formatMoney } from "../lib/format";
import { formatShopTime } from "../lib/shopTime";
import { ORDER_STATUS_LABEL, orderTypeLabel } from "../lib/enumLabels";
import { CancelOrderModal } from "../pages/orderDetail/CancelOrderModal";
import { COMPLETABLE_STATUSES, CompleteOrderDialog } from "./CompleteOrderDialog";
import { Button, Modal, StatusBadge } from "./ui";

type PendingScheduled = NonNullable<ApiErrorBody["scheduledOrders"]>;
type OpenOrder = NonNullable<ApiErrorBody["openOrders"]>[number];
type UnpaidOrder = NonNullable<ApiErrorBody["unpaidOrders"]>[number];

// What stopped the day ending, as the server listed it — kept up to date locally as staff finish
// each order from the dialog, so the list shrinks to nothing and "End day" goes through normally.
interface EndDayBlockers {
  openOrders: OpenOrder[];
  unpaidOrders: UnpaidOrder[];
}

interface Notice {
  title: string;
  message: string;
}

function formatStartedAt(startedAt: string): string {
  return new Date(startedAt).toLocaleString();
}

export function BusinessDayBar() {
  const navigate = useNavigate();
  const { staff } = useAuth();
  // The /business-day/* endpoints are POS_ADMIN/SUPER_ADMIN only — other staff
  // (e.g. ONLINE_ADMIN, who can still reach shared-shell pages like Menu) would
  // just get a 403 here, so skip the fetch and hide the bar for them entirely.
  const canManageBusinessDay = staff?.role === "SUPER_ADMIN" || staff?.role === "POS_ADMIN";

  const { data: businessDay, isLoading, isError } = useCurrentBusinessDay({
    enabled: canManageBusinessDay,
  });
  const startMutation = useStartBusinessDay();
  const endMutation = useEndBusinessDay();
  const releaseMutation = useReleaseScheduledOrder();
  const cancelScheduledMutation = useCancelScheduledOrder();
  const cancelMutation = useCancelOrder();
  // Set when ending the day was refused because scheduled orders are still on hold.
  const [pendingScheduled, setPendingScheduled] = useState<PendingScheduled | null>(null);
  const [scheduledBusy, setScheduledBusy] = useState(false);
  const [scheduledError, setScheduledError] = useState<string | null>(null);
  // Set when ending the day was refused because orders are still open or unpaid.
  const [blockers, setBlockers] = useState<EndDayBlockers | null>(null);
  const [endError, setEndError] = useState<string | null>(null);
  const [completeOrderId, setCompleteOrderId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<OpenOrder | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function handleStart() {
    try {
      await startMutation.mutateAsync(undefined);
    } catch (error) {
      setNotice({ title: "Couldn't start the day", message: getApiErrorMessage(error, "Failed to start business day") });
    }
  }

  async function handleEnd(force = false) {
    setEndError(null);
    try {
      await endMutation.mutateAsync(force);
      setBlockers(null);
    } catch (error) {
      const status = getApiErrorStatus(error);
      const body = getApiErrorBody(error);
      // Scheduled orders on hold block ending the day outright (even with force) — they'd be
      // released later into a closed day. Offer to release or cancel them instead.
      if (status === 409 && body?.code === "SCHEDULED_ORDERS_PENDING" && body.scheduledOrders) {
        setBlockers(null);
        setScheduledError(null);
        setPendingScheduled(body.scheduledOrders);
        return;
      }
      const openOrders = body?.openOrders ?? [];
      const unpaidOrders = body?.unpaidOrders ?? [];
      if (status === 400 && (openOrders.length > 0 || unpaidOrders.length > 0)) {
        setBlockers({ openOrders, unpaidOrders });
        return;
      }
      const message = getApiErrorMessage(error, "Failed to end business day");
      if (blockers) {
        setEndError(message);
      } else {
        setNotice({ title: "Couldn't end the day", message });
      }
    }
  }

  // An order just completed or cancelled from the dialog: it no longer blocks (completing needs the
  // payment in, cancelling takes it out of sales), so it leaves both lists.
  function dropBlocker(orderId: string) {
    setBlockers((current) =>
      current
        ? {
            openOrders: current.openOrders.filter((order) => order.id !== orderId),
            unpaidOrders: current.unpaidOrders.filter((order) => order.id !== orderId),
          }
        : current,
    );
  }

  async function handleCancelBlocker(reason: string) {
    if (!cancelTarget) {
      return;
    }
    await cancelMutation.mutateAsync({ id: cancelTarget.id, cancelledReason: reason });
    dropBlocker(cancelTarget.id);
    setCancelTarget(null);
  }

  // Runs every order through the same exactly-once action; one that the job released in the
  // meantime 409s, which is fine for "release" (it's out either way) and reported for "cancel".
  async function resolveScheduled(action: "release" | "cancel") {
    if (!pendingScheduled) {
      return;
    }
    setScheduledBusy(true);
    setScheduledError(null);
    const results = await Promise.allSettled(
      pendingScheduled.map((order) =>
        action === "release"
          ? releaseMutation.mutateAsync(order.id)
          : cancelScheduledMutation.mutateAsync({ id: order.id, reason: "Cancelled when the business day was ended" }),
      ),
    );
    setScheduledBusy(false);
    const failed = results.filter((result) => result.status === "rejected" && getApiErrorStatus(result.reason) !== 409);
    if (action === "cancel" && results.some((result) => result.status === "rejected" && getApiErrorStatus(result.reason) === 409)) {
      setScheduledError("Some of these were released before they could be cancelled — check Incoming orders.");
      return;
    }
    if (failed.length > 0) {
      const first = failed[0] as PromiseRejectedResult;
      setScheduledError(getApiErrorMessage(first.reason, `Failed to ${action} some scheduled orders`));
      return;
    }
    setPendingScheduled(null);
    if (action === "cancel") {
      // Nothing scheduled is left — carry on ending the day (the usual open-orders check still applies).
      await handleEnd();
    } else {
      navigate("/incoming-orders");
      setNotice({
        title: "Released to Incoming orders",
        message: "Accept or reject them there (they're live orders now), then end the day.",
      });
    }
  }

  if (!canManageBusinessDay) {
    return null;
  }

  let statusContent: ReactNode;
  if (isLoading) {
    statusContent = <span className="text-body text-ink-muted">Loading business day…</span>;
  } else if (isError) {
    statusContent = <span className="text-body text-status-danger-text">Could not load business day status.</span>;
  } else if (businessDay) {
    statusContent = (
      <>
        <span className="inline-flex items-center gap-1.5 text-body">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-success" aria-hidden="true" />
          <span className="font-medium text-ink">{businessDay.label}</span>
          <span className="text-ink-muted max-md:hidden">started {formatStartedAt(businessDay.startedAt)}</span>
        </span>
        <Button variant="secondary" onClick={() => void handleEnd()} disabled={endMutation.isPending}>
          {endMutation.isPending ? "Ending…" : "End day"}
        </Button>
      </>
    );
  } else {
    statusContent = (
      <>
        <span className="inline-flex items-center gap-1.5 text-body text-ink-muted">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-neutral" aria-hidden="true" />
          No active business day
        </span>
        <Button variant="primary" onClick={handleStart} disabled={startMutation.isPending}>
          {startMutation.isPending ? "Starting…" : "Start day"}
        </Button>
      </>
    );
  }

  const canCreateOrder = Boolean(businessDay);
  const openIds = new Set((blockers?.openOrders ?? []).map((order) => order.id));
  // Finished (completed) orders nobody marked paid — no Complete/Cancel for those, only the order page.
  const unpaidDone = (blockers?.unpaidOrders ?? []).filter((order) => !openIds.has(order.id));
  const isClear = blockers !== null && blockers.openOrders.length === 0 && unpaidDone.length === 0;

  return (
    // A plain wrapper, not <header> — this renders inside TopBar's own <header>,
    // and nesting header elements is invalid HTML.
    <div className="flex flex-1 items-center gap-3">
      <Modal
        isOpen={pendingScheduled !== null}
        onClose={() => setPendingScheduled(null)}
        title="Scheduled orders are still on hold"
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-ink">
            The day can't end while these are waiting for their time — they'd never reach Incoming orders. Release them
            now, or cancel them.
          </p>
          <ul className="flex list-none flex-col gap-1 text-body text-ink">
            {(pendingScheduled ?? []).map((order) => (
              <li key={order.id}>
                Order #{order.orderNumber} — scheduled for {formatShopTime(order.scheduledFor)}
              </li>
            ))}
          </ul>
          {scheduledError && (
            <p role="alert" className="text-body text-status-danger-text">
              {scheduledError}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setPendingScheduled(null)} disabled={scheduledBusy}>
              Keep the day open
            </Button>
            <Button variant="danger" onClick={() => resolveScheduled("cancel")} disabled={scheduledBusy}>
              Cancel all and end day
            </Button>
            <Button variant="success" onClick={() => resolveScheduled("release")} disabled={scheduledBusy}>
              {scheduledBusy ? "Working…" : "Release all now"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        // Hidden (not unmounted) while a Complete/Cancel dialog for one of its orders is up, so only one
        // native modal dialog is open at a time.
        isOpen={blockers !== null && completeOrderId === null && cancelTarget === null}
        onClose={() => setBlockers(null)}
        title={isClear ? "Ready to end the day" : "Finish these orders to end the day"}
        className="max-w-2xl"
      >
        <div className="flex flex-col gap-4">
          {blockers && blockers.openOrders.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-body text-ink">
                Still open ({blockers.openOrders.length}). Complete each one (an unpaid order takes the payment first) or
                cancel it.
              </p>
              <ul className="flex list-none flex-col divide-y divide-border rounded-card border border-border">
                {blockers.openOrders.map((order) => (
                  <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2">
                    <Link to={`/orders/${order.id}`} className="font-semibold text-accent no-underline hover:underline" onClick={() => setBlockers(null)}>
                      #{order.orderNumber}
                    </Link>
                    <span className="text-body text-ink-muted">
                      {orderTypeLabel(order)}
                      {order.diningArea ? ` · ${order.diningArea.name}` : ""} · {ORDER_STATUS_LABEL[order.status]}
                    </span>
                    <span className="text-numeric text-body text-ink">{formatMoney(order.totalAmount)}</span>
                    <StatusBadge status={order.paymentStatus} label={order.paymentStatus === "VERIFIED" ? "Paid" : "Unpaid"} />
                    <span className="ml-auto flex gap-2">
                      {COMPLETABLE_STATUSES.has(order.status) ? (
                        <Button variant="success" onClick={() => setCompleteOrderId(order.id)}>
                          Complete
                        </Button>
                      ) : (
                        // Waiting at reception: accept or reject it in Incoming orders.
                        <Link to="/incoming-orders" className="self-center text-body text-accent" onClick={() => setBlockers(null)}>
                          Review in Incoming
                        </Link>
                      )}
                      <Button variant="danger" onClick={() => setCancelTarget(order)}>
                        Cancel
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {unpaidDone.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-body text-ink">
                Finished but never marked paid ({unpaidDone.length}) — not counted in sales. Open each one and confirm its
                payment.
              </p>
              <ul className="flex list-none flex-col gap-1 text-body text-ink">
                {unpaidDone.map((order) => (
                  <li key={order.id}>
                    <Link to={`/orders/${order.id}`} className="text-accent" onClick={() => setBlockers(null)}>
                      #{order.orderNumber}
                    </Link>{" "}
                    · {formatMoney(order.totalAmount)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isClear && <p className="text-body text-ink">Every order is finished. The day can end now.</p>}
          {endError && (
            <p role="alert" className="text-body text-status-danger-text">
              {endError}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => setBlockers(null)} disabled={endMutation.isPending}>
              Keep the day open
            </Button>
            {!isClear && (
              // Still there for a real exception, but no longer the normal way to close a day.
              <Button variant="danger" onClick={() => void handleEnd(true)} disabled={endMutation.isPending}>
                End anyway
              </Button>
            )}
            <Button variant="primary" onClick={() => void handleEnd()} disabled={endMutation.isPending || !isClear}>
              {endMutation.isPending ? "Ending…" : "End day"}
            </Button>
          </div>
        </div>
      </Modal>

      <CompleteOrderDialog
        orderId={completeOrderId}
        onClose={() => setCompleteOrderId(null)}
        onCompleted={(order) => dropBlocker(order.id)}
      />
      {cancelTarget && (
        <CancelOrderModal
          isOpen
          orderNumber={cancelTarget.orderNumber}
          totalAmount={cancelTarget.totalAmount}
          isPaid={cancelTarget.paymentStatus === "VERIFIED"}
          isCancelling={cancelMutation.isPending}
          onClose={() => setCancelTarget(null)}
          onConfirm={handleCancelBlocker}
        />
      )}

      <Modal isOpen={notice !== null} onClose={() => setNotice(null)} title={notice?.title}>
        <div className="flex flex-col gap-4">
          <p className="text-body text-ink">{notice?.message}</p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setNotice(null)}>
              OK
            </Button>
          </div>
        </div>
      </Modal>

      <div className="flex items-center gap-3">{statusContent}</div>
      {/* Below md the mobile tab bar has its own "New order" tab. */}
      <div className="ml-auto flex max-md:hidden">
        <Button
          variant="primary"
          onClick={() => navigate("/orders/new")}
          disabled={!canCreateOrder}
          title={canCreateOrder ? undefined : "Start a business day before creating orders"}
        >
          New order
        </Button>
      </div>
    </div>
  );
}
