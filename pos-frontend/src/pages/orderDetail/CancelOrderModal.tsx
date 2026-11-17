import { useState } from "react";
import type { FormEvent } from "react";
import { getApiErrorMessage } from "../../api/errors";
import { Button, Modal, Textarea } from "../../components/ui";
import { formatMoney } from "../../lib/format";

// Same limit the server enforces on PATCH /orders/:id/cancel.
const CANCEL_REASON_MAX_LENGTH = 200;

interface CancelOrderModalProps {
  isOpen: boolean;
  orderNumber: number;
  totalAmount: string;
  isPaid: boolean;
  isCancelling: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<unknown>;
}

// Replaces the old window.prompt: a reason is required, and a paid order says plainly that the
// money has to be given back by hand — cancelling here never refunds anything.
export function CancelOrderModal({ isOpen, orderNumber, totalAmount, isPaid, isCancelling, onClose, onConfirm }: CancelOrderModalProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed === "") {
      setError("Enter a reason for cancelling.");
      return;
    }
    setError(null);
    try {
      await onConfirm(trimmed);
      setReason("");
    } catch (caught) {
      // 409 (completed / already cancelled), 403 (paid, wrong role): the server's own words.
      setError(getApiErrorMessage(caught, "Could not cancel the order."));
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Cancel order #${orderNumber}?`}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {isPaid && (
          <p role="alert" className="rounded-card border border-status-danger bg-status-danger-bg px-3 py-2 text-body text-status-danger-text">
            Customer has paid ({formatMoney(totalAmount)}) — refund must be handled manually.
          </p>
        )}
        <p className="text-body text-ink-muted">
          The kitchens are told to drop it and any stock it used is returned. This can't be undone.
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cancel-reason" className="text-meta font-medium text-ink-muted">
            Reason (required)
          </label>
          <Textarea
            id="cancel-reason"
            value={reason}
            maxLength={CANCEL_REASON_MAX_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Customer left, wrong table"
            autoFocus
          />
          <span className="self-end text-meta text-ink-muted">
            {reason.length}/{CANCEL_REASON_MAX_LENGTH}
          </span>
        </div>
        {error && (
          <p role="alert" className="text-body text-status-danger-text">
            {error}
          </p>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isCancelling}>
            Keep order
          </Button>
          <Button type="submit" variant="danger" disabled={isCancelling || trimmed === ""}>
            {isCancelling ? "Cancelling…" : "Cancel order"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
