import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { OrderSummary } from "../../api/orders";
import { getApiErrorMessage } from "../../api/errors";
import { useCancelOrder, useCreateOrderChange, useOrder, useOrderChanges } from "../../hooks/useOrders";
import { formatMoney } from "../../lib/format";
import { LineNote } from "../../components/LineNote";
import { Button, ConfirmDialog, StatusBadge } from "../../components/ui";
import { deriveDisplayStatus, TAKER_DISPLAY_STATUS_LABEL } from "./deriveDisplayStatus";

interface MyOrderCardProps {
  summary: OrderSummary;
}

const SELF_CANCEL_REASON = "Cancelled by the order taker";

export function MyOrderCard({ summary }: MyOrderCardProps) {
  const navigate = useNavigate();
  const { data: order } = useOrder(summary.id);
  const cancelMutation = useCancelOrder();
  const changeMutation = useCreateOrderChange();
  const { data: changes = [] } = useOrderChanges(summary.id);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  if (!order) {
    return (
      <div className="flex items-center justify-between rounded-card border border-border bg-surface-raised p-4">
        <span className="text-body text-ink-muted">Order #{summary.orderNumber}</span>
        <span className="text-meta text-ink-muted">Loading…</span>
      </div>
    );
  }

  const displayStatus = deriveDisplayStatus(order);
  const isSelfCancelled = order.status === "CANCELLED" && order.cancelledReason === SELF_CANCEL_REASON;
  const statusLabel =
    displayStatus === "CANCELLED" && !isSelfCancelled ? "Rejected" : TAKER_DISPLAY_STATUS_LABEL[displayStatus];

  const directItems = order.items.filter((item) => item.dealOrderLineId === null);

  const orderId = order.id;

  async function handleCancel() {
    setCancelError(null);
    try {
      await cancelMutation.mutateAsync({ id: orderId, cancelledReason: SELF_CANCEL_REASON });
      setIsCancelOpen(false);
    } catch (error) {
      setCancelError(getApiErrorMessage(error, "Failed to cancel order"));
    }
  }

  async function handleRequestedCancel() {
    setCancelError(null);
    try {
      await changeMutation.mutateAsync({ id: orderId, input: { kind: "CANCEL", reason: "Cancellation requested by the order taker" } });
      setIsCancelOpen(false);
    } catch (error) {
      setCancelError(getApiErrorMessage(error, "Failed to request cancellation"));
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-4">
      <button
        type="button"
        onClick={() => setIsExpanded((prev) => !prev)}
        className="flex items-center justify-between gap-2 text-left"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-body font-semibold text-ink">
            Order #{order.orderNumber}
            {order.diningArea && <span className="text-ink-muted"> · {order.diningArea.name}</span>}
          </span>
          <span className="text-numeric text-ink-muted">{formatMoney(order.totalAmount)}</span>
        </div>
        <StatusBadge status={displayStatus} label={statusLabel} />
      </button>

      {isExpanded && (
        <div className="flex flex-col gap-2 border-t border-border pt-2">
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
                {line.customization && (
                  <div className="ml-4 flex flex-col text-meta text-ink-muted">
                    {line.customization.items.map((item, index) => (
                      <span key={index}>
                        {item.quantity}× {item.name}
                        {item.variantLabel && ` · ${item.variantLabel}`}
                      </span>
                    ))}
                  </div>
                )}
                {line.notes && <LineNote notes={line.notes} className="ml-4" />}
              </li>
            ))}
          </ul>
          {order.notes && <p className="text-meta text-ink-muted">Note: {order.notes}</p>}
          {displayStatus === "CANCELLED" && !isSelfCancelled && order.cancelledReason && (
            <p className="text-meta text-status-danger-text">Reason: {order.cancelledReason}</p>
          )}

          {order.status === "AWAITING_RECEPTION" && (
            <div className="flex gap-2 pt-1">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => navigate("/take-order", { state: { editOrderId: order.id } })}
              >
                Edit
              </Button>
              <Button variant="danger" className="flex-1" onClick={() => setIsCancelOpen(true)}>
                Cancel
              </Button>
            </div>
          )}
          {order.status !== "AWAITING_RECEPTION" && order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
            <Button
              variant="secondary"
              onClick={() => navigate("/take-order", { state: { editOrderId: order.id } })}
            >
              Request order edit
            </Button>
          )}
          {order.status !== "AWAITING_RECEPTION" && order.status !== "CANCELLED" && order.status !== "COMPLETED" && (
            <Button variant="danger" onClick={() => setIsCancelOpen(true)}>
              Request cancellation
            </Button>
          )}
          {changes.filter((change) => change.status === "PENDING").map((change) => (
            <p key={change.id} className="text-meta text-status-warning-text">
              {change.kind === "CANCEL" ? "Cancellation" : "Change"} request awaiting reception
            </p>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={isCancelOpen}
        onClose={() => setIsCancelOpen(false)}
        onConfirm={order.status === "AWAITING_RECEPTION" ? handleCancel : handleRequestedCancel}
        title={`${order.status === "AWAITING_RECEPTION" ? "Cancel" : "Request cancellation for"} order #${order.orderNumber}?`}
        message={
          order.status === "AWAITING_RECEPTION"
            ? "This order hasn't been sent to the kitchen yet. Cancelling it can't be undone."
            : "Reception must approve cancellation after an order has been accepted."
        }
        confirmLabel={order.status === "AWAITING_RECEPTION" ? "Cancel order" : "Request cancellation"}
        isConfirming={cancelMutation.isPending || changeMutation.isPending}
        error={cancelError}
      />
    </div>
  );
}
