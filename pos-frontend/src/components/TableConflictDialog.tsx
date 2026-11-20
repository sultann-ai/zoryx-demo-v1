import { describeSessionSummary } from "../lib/tableErrors";
import type { TableConflict } from "../lib/tableErrors";
import { Button, FormActions, Modal } from "./ui";

interface TableConflictDialogProps {
  // The 409 the order got back (TABLE_OCCUPIED / TABLE_STATE_CHANGED / TABLE_DECISION_NEEDED); null = closed.
  conflict: TableConflict | null;
  // The table's name as this screen knows it, for when the server's summary is missing.
  tableName: string;
  // Resend the order onto the open session (an id), or onto the table as free now (null).
  onConfirm: (expectedTableSessionId: string | null) => void;
  onClose: () => void;
  isSubmitting: boolean;
  // "Choose another table" — e.g. back to the picker. Defaults to just closing.
  pickAnotherLabel?: string;
}

// Table sync R2: an order never lands on a table's bill without the person sending it saying so. When the
// table turns out to be open (another cashier or a waiter got there first, or this screen was stale), this
// asks once — "Add to Table 2's bill" — and the order is resent with that session's id.
export function TableConflictDialog({ conflict, tableName, onConfirm, onClose, isSubmitting, pickAnotherLabel = "Pick another table" }: TableConflictDialogProps) {
  const session = conflict?.session ?? null;
  const name = session?.tableName ?? tableName;
  const title =
    conflict?.code === "TABLE_STATE_CHANGED"
      ? session
        ? `${name} changed while you were ordering`
        : `${name} was closed meanwhile`
      : `${name} is already open`;
  return (
    <Modal isOpen={conflict !== null} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-body text-ink">{conflict?.message}</p>
        {session && (
          <p className="m-0 rounded-card border border-border bg-surface px-3 py-2 text-body text-ink-muted tabular-nums">
            {describeSessionSummary(session)}
          </p>
        )}
        <p className="m-0 text-meta text-ink-muted">
          {session
            ? "Add it only if this order is for the same party. A different party needs another table (or the old one settled and closed first)."
            : "The table is free now: sending the order seats it."}
        </p>
        <FormActions>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {pickAnotherLabel}
          </Button>
          <Button onClick={() => onConfirm(session?.id ?? null)} disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : session ? `Add to ${name}'s bill` : `Seat ${name} and send`}
          </Button>
        </FormActions>
      </div>
    </Modal>
  );
}
