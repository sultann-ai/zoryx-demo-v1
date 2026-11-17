import { useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../api/errors";
import type { OrderDetail } from "../api/orders";
import { useUpdateOrderPaymentStatus } from "../hooks/useOrders";
import { Button, FormActions, Input } from "./ui";
import { DiscountCapHint } from "./DiscountCapHint";

interface ConfirmPaymentFormProps {
  order: OrderDetail;
  submitLabel?: string;
  // Inside a Modal the buttons sit in a plain right-aligned row (FormActions is made for a Card).
  inModal?: boolean;
  // Runs after the payment is saved, with the order as the server returned it (a POS takeaway may
  // already be COMPLETED by then — the server auto-completes it). Errors it throws are shown here.
  onPaid?: (order: OrderDetail) => Promise<unknown> | void;
}

// The cash "Confirm Payment" step: discount (a reason when it changes to above 0), amount handed
// over, and the change due. Used on the order page and as the first step of "Complete order" on an
// unpaid order. Key it by the order id so a different order starts fresh.
export function ConfirmPaymentForm({ order, submitLabel = "Confirm Payment", inModal = false, onPaid }: ConfirmPaymentFormProps) {
  const paymentStatusMutation = useUpdateOrderPaymentStatus();
  // Starts from the order's current discount, so confirming without touching it can't reset one
  // that was already set some other way.
  const [discount, setDiscount] = useState(order.discount);
  const [discountReason, setDiscountReason] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

  // order.totalAmount already has the order's CURRENT discount subtracted — add it back to get the
  // pre-discount total, then apply whatever's typed, so the preview updates live.
  const preDiscountTotal = Number(order.totalAmount) + Number(order.discount);
  const discountNumber = Number(discount) || 0;
  const needsDiscountReason = discountNumber !== Number(order.discount) && discountNumber > 0;
  const newTotal = Math.max(preDiscountTotal - discountNumber, 0);
  const paidNumber = paidAmount.trim() === "" ? null : Number(paidAmount);
  const changeDue = paidNumber !== null && !Number.isNaN(paidNumber) ? paidNumber - newTotal : null;
  const isBusy = paymentStatusMutation.isPending || isFinishing;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsedDiscount = Number(discount);
    if (discount.trim() === "" || Number.isNaN(parsedDiscount) || parsedDiscount < 0) {
      setError("Discount must be a non-negative number.");
      return;
    }
    const parsedPaid = Number(paidAmount);
    if (paidAmount.trim() === "" || Number.isNaN(parsedPaid) || parsedPaid < 0) {
      setError("Enter how much was paid.");
      return;
    }
    if (needsDiscountReason && discountReason.trim() === "") {
      setError("Enter a reason for the discount.");
      return;
    }

    let paid: OrderDetail;
    try {
      paid = await paymentStatusMutation.mutateAsync({
        id: order.id,
        paymentStatus: "VERIFIED",
        discount: parsedDiscount,
        ...(needsDiscountReason ? { discountReason: discountReason.trim() } : {}),
        paidAmount: parsedPaid,
      });
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Failed to confirm payment"));
      return;
    }
    if (onPaid) {
      setIsFinishing(true);
      try {
        await onPaid(paid);
      } catch (caught) {
        setError(getApiErrorMessage(caught, "Payment saved, but the next step failed"));
      } finally {
        setIsFinishing(false);
      }
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`confirm-discount-${order.id}`} className="text-meta font-medium text-ink-muted">
            Discount
          </label>
          <Input
            id={`confirm-discount-${order.id}`}
            type="number"
            min={0}
            step={0.01}
            value={discount}
            onChange={(event) => setDiscount(event.target.value)}
          />
          <DiscountCapHint />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`confirm-paid-${order.id}`} className="text-meta font-medium text-ink-muted">
            Amount paid
          </label>
          <Input
            id={`confirm-paid-${order.id}`}
            type="number"
            min={0}
            step={0.01}
            value={paidAmount}
            onChange={(event) => setPaidAmount(event.target.value)}
            required
          />
        </div>
      </div>
      {needsDiscountReason && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`confirm-discount-reason-${order.id}`} className="text-meta font-medium text-ink-muted">
            Discount reason (required)
          </label>
          <Input
            id={`confirm-discount-reason-${order.id}`}
            value={discountReason}
            maxLength={200}
            onChange={(event) => setDiscountReason(event.target.value)}
            placeholder="e.g. regular customer, late order"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-6 text-body text-ink">
        <span>
          Total after discount: <span className="text-numeric font-medium">{newTotal.toFixed(2)}</span>
        </span>
        {changeDue !== null && (
          <span>
            Change due: <span className="text-numeric font-medium">{changeDue.toFixed(2)}</span>
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-body text-status-danger-text">
          {error}
        </p>
      )}
      {inModal ? (
        <div className="flex justify-end gap-2">
          <Button type="submit" variant="success" disabled={isBusy}>
            {isBusy ? "Saving…" : submitLabel}
          </Button>
        </div>
      ) : (
        <FormActions>
          <Button type="submit" variant="success" disabled={isBusy}>
            {isBusy ? "Saving…" : submitLabel}
          </Button>
        </FormActions>
      )}
    </form>
  );
}
