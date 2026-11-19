import { useState } from "react";

// The selected area, remembered for this browser tab's session (spec §8.2). Every access guarded:
// storage can be blocked, and the page must work without it.
export function useRememberedArea(storageKey: string, areas: string[]): [string, (area: string) => void] {
  const [stored, setStored] = useState<string | null>(() => {
    try {
      return window.sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });
  const active = stored !== null && areas.includes(stored) ? stored : (areas[0] ?? "");
  function select(area: string) {
    setStored(area);
    try {
      window.sessionStorage.setItem(storageKey, area);
    } catch {
      // Not remembered — still selected for now.
    }
  }
  return [active, select];
}
