import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

// Built on the native <dialog> element — no portal library, no custom
// backdrop. No built-in close/X button: callers put their own Cancel/Save
// buttons in `children`, same as every form elsewhere in this app.
//
// If content needs to reset when reopened for a different record, key it by
// that record's id (see AdjustStockDialog for the pattern) rather than
// resetting state in an effect here.
export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (isOpen && !dialog.open) {
      dialog.showModal();
    } else if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className={cn(
        // Tailwind's preflight resets margin to 0, which breaks the native
        // <dialog>'s default centering (it relies on `margin: auto`) — restore it.
        "m-auto w-full max-w-md rounded-card border border-border bg-surface-raised p-0 backdrop:bg-ink/40",
        className,
      )}
    >
      {isOpen && (
        <div className="p-5">
          {title && <h2 className="mb-4 font-heading text-section font-semibold text-ink">{title}</h2>}
          {children}
        </div>
      )}
    </dialog>
  );
}
