import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { ApiErrorBody } from "../api/errors";
import { getApiErrorBody, getApiErrorMessage, getApiErrorStatus } from "../api/errors";
import { useAuth } from "../context/AuthContext";
import { useCurrentBusinessDay, useEndBusinessDay, useStartBusinessDay } from "../hooks/useBusinessDay";
import { useCancelScheduledOrder, useReleaseScheduledOrder } from "../hooks/useOrders";
import { formatMoney } from "../lib/format";
import { formatShopTime } from "../lib/shopTime";
import { Button, Modal } from "./ui";

type PendingScheduled = NonNullable<ApiErrorBody["scheduledOrders"]>;

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
  // Set when ending the day was refused because scheduled orders are still on hold.
  const [pendingScheduled, setPendingScheduled] = useState<PendingScheduled | null>(null);
  const [scheduledBusy, setScheduledBusy] = useState(false);
  const [scheduledError, setScheduledError] = useState<string | null>(null);

  async function handleStart() {
    try {
      await startMutation.mutateAsync(undefined);
    } catch (error) {
      window.alert(getApiErrorMessage(error, "Failed to start business day"));
    }
  }

  async function handleEnd() {
    try {
      await endMutation.mutateAsync(undefined);
    } catch (error) {
      const status = getApiErrorStatus(error);
      const body = getApiErrorBody(error);
      // Scheduled orders on hold block ending the day outright (even with force) — they'd be
      // released later into a closed day. Offer to release or cancel them instead.
      if (status === 409 && body?.code === "SCHEDULED_ORDERS_PENDING" && body.scheduledOrders) {
        setScheduledError(null);
        setPendingScheduled(body.scheduledOrders);
        return;
      }
      const orderIds = body?.orderIds ?? [];
      const unpaidOrders = body?.unpaidOrders ?? [];
      if (status === 400 && (orderIds.length > 0 || unpaidOrders.length > 0)) {
        const parts: string[] = [];
        if (orderIds.length > 0) {
          parts.push(
            `${orderIds.length} order(s) are still open (awaiting reception, pending, confirmed, in kitchen, or ready — not yet marked delivered).`,
          );
        }
        if (unpaidOrders.length > 0) {
          // By number and amount, so whoever ends the day knows exactly what isn't in today's sales.
          parts.push(
            `${unpaidOrders.length} order(s) are NOT marked paid — ${formatMoney(body?.unpaidTotal ?? "0")} not counted in sales:\n` +
              unpaidOrders.map((order) => `  #${order.orderNumber} · ${formatMoney(order.totalAmount)}`).join("\n"),
          );
        }
        const confirmed = window.confirm(`${parts.join("\n\n")}\n\nEnd the business day anyway?`);
        if (confirmed) {
          try {
            await endMutation.mutateAsync(true);
          } catch (retryError) {
            window.alert(getApiErrorMessage(retryError, "Failed to end business day"));
          }
        }
        return;
      }
      window.alert(getApiErrorMessage(error, "Failed to end business day"));
    }
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
      window.alert(
        "Released to Incoming orders. Accept or reject them there (they're live orders now), then end the day.",
      );
      navigate("/incoming-orders");
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
        <Button variant="secondary" onClick={handleEnd} disabled={endMutation.isPending}>
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
