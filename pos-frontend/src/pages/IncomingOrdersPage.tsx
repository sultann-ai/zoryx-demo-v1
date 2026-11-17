import { useState } from "react";
import type { OrderDetail } from "../api/orders";
import { getApiErrorMessage } from "../api/errors";
import { useAuth } from "../context/AuthContext";
import { useIncomingOrdersContext } from "../context/IncomingOrdersContext";
import { useKitchens } from "../hooks/useKitchens";
import { usePrintDocs } from "../hooks/usePrinter";
import { useIncomingOrderChanges, useReviewOrderChange } from "../hooks/useOrders";
import { buildKitchenTicketDocs } from "../print/buildKitchenTicketDocs";
import { diffAddedQuantities } from "../print/kitchenSlip";
import { buildReceiptDoc } from "../print/buildReceiptDoc";
import { Button, EmptyState, PageHeader } from "../components/ui";
import { EmptyOrdersIllustration } from "./incoming/EmptyOrdersIllustration";
import { FindByCodeBox } from "./incoming/FindByCodeBox";
import { IncomingOrderCard } from "./incoming/IncomingOrderCard";
import { SourceFilterChips } from "./incoming/SourceFilterChips";
import type { SourceFilter } from "./incoming/SourceFilterChips";

interface PrintFailure {
  order: OrderDetail;
  message: string;
}

export function IncomingOrdersPage() {
  const { incomingOrders, connectionStatus, isMuted, toggleMute } = useIncomingOrdersContext();
  const { data: kitchens } = useKitchens();
  const printMutation = usePrintDocs();
  const { staff } = useAuth();
  // An online admin only sees online orders, so there is no source filter to offer; and order-change
  // requests (an order-taker asking to edit or cancel) are reception's, not theirs.
  const isOnlineAdmin = staff?.role === "ONLINE_ADMIN";
  const { data: changeRequests = [] } = useIncomingOrderChanges(!isOnlineAdmin);
  const reviewChange = useReviewOrderChange();

  async function handleReviewChange(changeId: string, approved: boolean) {
    setChangeActionError(null);
    // The order as it was before this edit — approving re-creates every item, so what's new
    // is found by comparing contents, then marked ADDED on every kitchen's slip.
    const before = changeRequests.find((change) => change.id === changeId)?.order;
    try {
      const result = await reviewChange.mutateAsync({ changeId, approved });
      if (approved && result.change.kind === "EDIT" && result.order) {
        const added = before ? diffAddedQuantities(before, result.order) : new Map<string, number>();
        const docs = [buildReceiptDoc(result.order), ...buildKitchenTicketDocs(result.order, kitchens ?? [], { added })];
        await printMutation.mutateAsync({ docs });
      }
    } catch (error) {
      setChangeActionError(getApiErrorMessage(error, "Could not review or print order change"));
    }
  }

  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [goneIds, setGoneIds] = useState<Set<string>>(new Set());
  const [printFailures, setPrintFailures] = useState<PrintFailure[]>([]);
  const [changeActionError, setChangeActionError] = useState<string | null>(null);

  // A 409 (someone else already reviewed it) removes the card immediately rather than
  // waiting for the next poll — the one place this page doesn't let "the server's list
  // always wins" be the only mechanism, since the point of a 409 is "stop right now."
  function handleGone(orderId: string) {
    setGoneIds((prev) => new Set(prev).add(orderId));
  }

  function handlePrintFailure(order: OrderDetail, message: string) {
    setPrintFailures((prev) => [...prev, { order, message }]);
  }

  async function handleReprint(failure: PrintFailure) {
    try {
      const docs = [buildReceiptDoc(failure.order), ...buildKitchenTicketDocs(failure.order, kitchens ?? [])];
      await printMutation.mutateAsync({ docs });
      setPrintFailures((prev) => prev.filter((item) => item.order.id !== failure.order.id));
    } catch (error) {
      setPrintFailures((prev) =>
        prev.map((item) =>
          item.order.id === failure.order.id ? { ...item, message: getApiErrorMessage(error, "Failed to print") } : item,
        ),
      );
    }
  }

  const visibleOrders = incomingOrders.filter((order) => !goneIds.has(order.id));
  const counts = {
    all: visibleOrders.length,
    orderTaker: visibleOrders.filter((order) => order.source === "ORDER_TAKER").length,
    online: visibleOrders.filter((order) => order.source === "ONLINE").length,
    scheduled: visibleOrders.filter((order) => order.source === "POS").length,
  };
  const filteredOrders = visibleOrders.filter((order) => {
    if (sourceFilter === "ALL") return true;
    return order.source === sourceFilter;
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Incoming Orders"
        description={
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${connectionStatus === "live" ? "bg-status-success" : "bg-status-warning"}`}
              aria-hidden="true"
            />
            {connectionStatus === "live" ? "Live" : "Reconnecting…"}
          </span>
        }
        actions={
          <Button variant="secondary" onClick={toggleMute}>
            {isMuted ? "Unmute chime" : "Mute chime"}
          </Button>
        }
      />

      {printFailures.length > 0 && (
        <div className="flex flex-col gap-2">
          {printFailures.map((failure) => (
            <div
              key={failure.order.id}
              role="alert"
              className="flex items-center justify-between gap-2 rounded-card border border-status-danger bg-status-danger-bg px-4 py-3 text-body text-status-danger-text"
            >
              <span>
                Order #{failure.order.orderNumber} sent to kitchen — printing failed: {failure.message}
              </span>
              <Button variant="danger" onClick={() => handleReprint(failure)} disabled={printMutation.isPending}>
                Reprint
              </Button>
            </div>
          ))}
        </div>
      )}

      {changeActionError && (
        <p role="alert" className="rounded-card border border-status-danger bg-status-danger-bg px-4 py-3 text-body text-status-danger-text">
          {changeActionError}
        </p>
      )}

      <FindByCodeBox kitchens={kitchens ?? []} onGone={handleGone} onPrintFailure={handlePrintFailure} />

      {!isOnlineAdmin && <SourceFilterChips value={sourceFilter} onChange={setSourceFilter} counts={counts} />}

      {changeRequests.length > 0 && (
        <section className="flex flex-col gap-2 rounded-card border border-status-warning bg-status-warning-bg p-4">
          <h2 className="text-heading-sm font-semibold text-ink">Order change requests</h2>
          {changeRequests.map((change) => (
            <div key={change.id} className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface-raised p-3">
              <div className="text-body text-ink">
                <p className="font-medium">
                  Order #{change.order.orderNumber}: {change.kind === "CANCEL" ? "cancel" : "add items"} requested by {change.requestedBy.name}
                </p>
                {change.reason && <p className="text-body-sm text-ink-muted">{change.reason}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => handleReviewChange(change.id, false)}
                  disabled={reviewChange.isPending}
                >
                  Reject
                </Button>
                <Button
                  onClick={() => handleReviewChange(change.id, true)}
                  disabled={reviewChange.isPending}
                >
                  Approve
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {filteredOrders.length === 0 ? (
        <EmptyState
          illustration={<EmptyOrdersIllustration />}
          title="No orders waiting"
          description="You're all caught up. New orders will show up here as they come in."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredOrders.map((order) => (
            <IncomingOrderCard
              key={order.id}
              order={order}
              kitchens={kitchens ?? []}
              onGone={handleGone}
              onPrintFailure={handlePrintFailure}
            />
          ))}
        </div>
      )}
    </div>
  );
}
