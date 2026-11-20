import { useEffect, useId, useRef } from "react";
import type { MouseEvent, ReactNode, RefObject } from "react";
import { Icon } from "../shell/icons";
import { cn } from "./cn";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  // "dialog" (default): a small card for forms. "lightbox": full screen on a dark backdrop, for looking
  // at an image — see below.
  variant?: "dialog" | "lightbox";
  // Lightbox only: where focus goes back to on close. Defaults to whatever was focused on open (Safari
  // doesn't focus a button on click, so pass the opener's ref when there is one).
  returnFocusRef?: RefObject<HTMLElement | null>;
}

// Marks an area of a lightbox as "backdrop": clicking it (not a child of it) closes the lightbox.
export const LIGHTBOX_BACKDROP_ATTR = "data-modal-backdrop";

// The history entry a lightbox pushes while open, so the phone's back button closes it in place.
const HISTORY_KEY = "zoryxOverlay";
// Per lightbox: bumped on every open, so a close scheduled by an earlier open (StrictMode runs effects
// twice) knows it has been superseded.
const openCounts = new Map<string, number>();

// Built on the native <dialog> element — no portal library, no custom
// backdrop. No built-in close/X button: callers put their own Cancel/Save
// buttons in `children`, same as every form elsewhere in this app.
//
// The "lightbox" variant is the exception: there are no form buttons to close it with, so it has a
// always-visible X, closes on a backdrop click, on Escape (native) and on the browser/phone back
// button (it pushes a history entry while open and pops it on close), locks page scrolling and gives
// focus back to the opener.
//
// If content needs to reset when reopened for a different record, key it by
// that record's id (see AdjustStockDialog for the pattern) rather than
// resetting state in an effect here.
export function Modal({ isOpen, onClose, title, children, className, variant = "dialog", returnFocusRef }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isLightbox = variant === "lightbox";
  const historyId = useId();
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

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

  useEffect(() => {
    if (!isOpen || !isLightbox) {
      return;
    }
    const token = (openCounts.get(historyId) ?? 0) + 1;
    openCounts.set(historyId, token);
    const opener = returnFocusRef?.current ?? (document.activeElement as HTMLElement | null);

    const root = document.documentElement;
    const previousOverflow = { root: root.style.overflow, body: document.body.style.overflow };
    root.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    // Same URL, same router state (React Router keeps its own fields in history.state), plus our mark.
    const ownsTopEntry = () => (window.history.state as Record<string, unknown> | null)?.[HISTORY_KEY] === historyId;
    if (!ownsTopEntry()) {
      window.history.pushState({ ...(window.history.state as object | null), [HISTORY_KEY]: historyId }, "");
    }
    const onPopState = () => onCloseRef.current();
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      root.style.overflow = previousOverflow.root;
      document.body.style.overflow = previousOverflow.body;
      opener?.focus();
      // Closed by X, backdrop, Escape or unmount (not by Back): drop the entry we pushed. Deferred so
      // StrictMode's immediate re-open keeps the entry instead of popping it.
      setTimeout(() => {
        if (openCounts.get(historyId) !== token) {
          return;
        }
        openCounts.delete(historyId);
        if (ownsTopEntry()) {
          window.history.back();
        }
      }, 0);
    };
  }, [isOpen, isLightbox, historyId, returnFocusRef]);

  const closeOnBackdrop = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target === event.currentTarget || target.hasAttribute(LIGHTBOX_BACKDROP_ATTR)) {
      onClose();
    }
  };

  if (isLightbox) {
    return (
      <dialog
        ref={dialogRef}
        onClose={onClose}
        onClick={closeOnBackdrop}
        className={cn(
          "fixed inset-0 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-ink/90",
          className,
        )}
      >
        {isOpen && (
          <div {...{ [LIGHTBOX_BACKDROP_ATTR]: "" }} className="flex h-full w-full flex-col">
            {/* First focusable element, so showModal() puts keyboard focus on it. Dark fill with a white
                outline: stays visible over the dark backdrop and over a white screenshot alike. */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="fixed top-3 right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-card border-2 border-white bg-ink text-white hover:bg-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              <Icon name="close" />
            </button>
            {title && (
              <h2 {...{ [LIGHTBOX_BACKDROP_ATTR]: "" }} className="shrink-0 py-4 pr-16 pl-4 text-body font-medium text-white">
                {title}
              </h2>
            )}
            {children}
          </div>
        )}
      </dialog>
    );
  }

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
