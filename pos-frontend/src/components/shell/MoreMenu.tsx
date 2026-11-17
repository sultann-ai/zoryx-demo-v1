import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import type { ShellDestination } from "../../routes/mobileShell";
import { Button } from "../ui";
import { cn } from "../ui/cn";
import { Icon } from "./icons";

interface MoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  destinations: ShellDestination[];
  staffName: string | null;
  onLogout: () => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent";

// Full-screen, slides up from the bottom. A native <dialog> (not the shared
// Modal, which is a centered card) so Escape, focus trapping and an inert
// page behind it come for free.
export function MoreMenu({ isOpen, onClose, destinations, staffName, onLogout }: MoreMenuProps) {
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

  // Rotating a tablet (or resizing) past the breakpoint hides this dialog with
  // CSS, but a modal dialog that's merely hidden still leaves the page behind
  // it inert — so close it for real.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const query = window.matchMedia("(min-width: 768px)");
    function handleChange(event: MediaQueryListEvent) {
      if (event.matches) {
        onClose();
      }
    }
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [isOpen, onClose]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label="More"
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-surface p-0 motion-safe:animate-slide-up md:hidden"
    >
      {isOpen && (
        <div className="flex h-full flex-col">
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-surface-raised pl-4 pr-2">
            <span className="font-heading text-section font-semibold text-ink">More</span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className={cn(
                "flex h-11 w-11 items-center justify-center rounded-card border-0 bg-transparent text-ink",
                FOCUS_RING,
              )}
            >
              <Icon name="close" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {destinations.length > 0 && (
              <nav aria-label="More destinations" className="mt-4">
                <ul className="m-0 list-none border-y border-border bg-surface-raised p-0">
                  {destinations.map((destination) => (
                    <li key={destination.to} className="border-b border-border last:border-b-0">
                      {destination.newTab ? (
                        <a
                          href={destination.to}
                          target="_blank"
                          rel="noopener"
                          onClick={onClose}
                          className={cn("flex h-14 items-center px-4 text-body font-medium text-ink no-underline", FOCUS_RING)}
                        >
                          {destination.label} ↗
                        </a>
                      ) : (
                      <NavLink
                        to={destination.to}
                        onClick={onClose}
                        className={({ isActive }) =>
                          cn(
                            "flex h-14 items-center px-4 text-body font-medium no-underline",
                            FOCUS_RING,
                            isActive ? "bg-surface text-accent font-semibold" : "text-ink",
                          )
                        }
                      >
                        {destination.label}
                      </NavLink>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            <div className="mt-4 flex flex-col gap-3 border-y border-border bg-surface-raised p-4">
              {staffName && <span className="text-body text-ink-muted">Signed in as {staffName}</span>}
              <Button variant="secondary" className="w-full" onClick={onLogout}>
                Log out
              </Button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}
