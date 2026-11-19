import { useSyncExternalStore } from "react";

// Whether a CSS media query matches, kept in step as the window is resized or a tablet rotated.
// For layout that must change structure (a docked panel vs. a modal sheet), not just style —
// a hidden modal <dialog> would still leave the page behind it inert.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
