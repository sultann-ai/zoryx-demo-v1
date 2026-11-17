import type { ReactNode } from "react";
import { Button } from "./Button";
import type { ButtonVariant } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  // Caller-owned, same as everywhere else in this app's forms — this component renders
  // what it's given, it never calls an API or formats an error itself.
  isConfirming?: boolean;
  error?: string | null;
  // Defaults suit a delete; a non-destructive confirm (e.g. "Release now") can pass its own.
  confirmVariant?: ButtonVariant;
  confirmingLabel?: string;
}

// A Modal-based replacement for window.confirm on a destructive action. Fully controlled,
// same philosophy as Modal itself: the caller owns isConfirming/error state and decides
// whether to close (on success) or keep it open with `error` set (e.g. a 409).
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isConfirming = false,
  error = null,
  confirmVariant = "danger",
  confirmingLabel = "Deleting…",
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col gap-4">
        <div className="text-body text-ink">{message}</div>
        {error && (
          <p role="alert" className="text-body text-status-danger-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isConfirming}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} onClick={onConfirm} disabled={isConfirming}>
            {isConfirming ? confirmingLabel : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
