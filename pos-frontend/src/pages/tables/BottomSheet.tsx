import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

// A modal sheet that slides up from the bottom (phones and tablets; wide screens dock the panel
// instead). A native <dialog>, like MoreMenu: Escape, focus trapping and an inert page come free.
// Tapping the dimmed backdrop closes it.
export function BottomSheet({ isOpen, onClose, label, children }: { isOpen: boolean; onClose: () => void; label: string; children: ReactNode }) {
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
      aria-label={label}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          onClose();
        }
      }}
      className="m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-hidden rounded-t-card border border-b-0 border-border bg-surface-raised p-0 text-ink backdrop:bg-ink/40 motion-safe:animate-slide-up sm:mx-auto sm:max-w-xl"
    >
      {isOpen && (
        <div className="max-h-[85dvh] overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden="true" />
          {children}
        </div>
      )}
    </dialog>
  );
}
