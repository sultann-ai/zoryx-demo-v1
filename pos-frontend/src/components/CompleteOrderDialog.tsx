import { useState } from "react";
import { getApiErrorMessage } from "../api/errors";
import type { OrderDetail } from "../api/orders";
import { useCompleteOrder, useOrder } from "../hooks/useOrders";
import { formatMoney } from "../lib/format";
import { ConfirmPaymentForm } from "./ConfirmPaymentForm";
import { Button, Modal } from "./ui";

// Only these can be completed (the server's COMPLETABLE_STATUSES).
export const COMPLETABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);

interface CompleteOrderDialogProps {
  // The order to complete; null keeps the dialog closed.
  orderId: string | null;
  onClose: () => void;
  onCompleted?: (order: OrderDetail) => void;
}

// "Complete order" as one flow, wherever it's started (order page, orders list, End Day): a paid order
// is completed after a confirm; an unpaid cash order first goes through Confirm Payment (cash taken,
// change, discount with a reason) and is completed straight after. An online payment nobody has
// verified can't be completed here — it has to be verified first.
export function CompleteOrderDialog({ orderId, onClose, onCompleted }: CompleteOrderDialogProps) {
  const { data: order, isLoading, isError } = useOrder(orderId ?? "", { enabled: orderId !== null });
  const completeMutation = useCompleteOrder();
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function complete(target: OrderDetail) {
    // A POS takeaway is completed by the server the moment it's paid — nothing left to do.
    const done = target.status === "COMPLETED" ? target : await completeMutation.mutateAsync(target.id);
    setError(null);
    onCompleted?.(done);
    onClose();
  }

  async function handleCompletePaid(target: OrderDetail) {
    setError(null);
    try {
      await complete(target);
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Could not complete the order."));
    }
  }

  const isOpen = orderId !== null;
  const title = order ? `Complete order #${order.orderNumber}` : "Complete order";

  let body;
  if (isLoading || (!order && !isError)) {
    body = <p className="text-body text-ink-muted">Loading order…</p>;
  } else if (isError || !order) {
    body = <p className="text-body text-status-danger-text">Could not load this order.</p>;
  } else if (!COMPLETABLE_STATUSES.has(order.status)) {
    body = <p className="text-body text-ink">This order is {order.status.toLowerCase().replace(/_/g, " ")} and can't be completed.</p>;
  } else if (order.paymentStatus === "VERIFIED") {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink">
          Paid {formatMoney(order.totalAmount)}. Completing finishes the order: anything still on a kitchen screen is
          marked served and taken off it.
        </p>
        {error && (
          <p role="alert" className="text-body text-status-danger-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={completeMutation.isPending}>
            Not yet
          </Button>
          <Button variant="success" onClick={() => void handleCompletePaid(order)} disabled={completeMutation.isPending}>
            {completeMutation.isPending ? "Completing…" : "Complete order"}
          </Button>
        </div>
      </div>
    );
  } else if (order.paymentMethod === "CASH") {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink">
          Not paid yet ({formatMoney(order.totalAmount)}). Confirm the payment first — the order is completed straight
          after.
        </p>
        <ConfirmPaymentForm key={order.id} order={order} inModal submitLabel="Confirm payment & complete" onPaid={complete} />
        <Button variant="secondary" onClick={close} className="self-start">
          Not yet
        </Button>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-body text-ink">
          This order was paid online and the payment hasn't been verified yet. Check the payment proof and verify it
          first, then complete the order.
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} className="max-w-lg">
      {body}
    </Modal>
  );
}
