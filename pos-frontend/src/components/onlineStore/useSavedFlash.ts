import { useCallback, useEffect, useRef, useState } from "react";

// A "✓ Saved" that appears for a couple of seconds after a row saves, so a person tapping through a long
// list knows each change went through without a toast per row.
export function useSavedFlash(durationMs = 2500): { isVisible: boolean; flash: () => void } {
  const [isVisible, setIsVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback(() => {
    setIsVisible(true);
    if (timer.current) {
      clearTimeout(timer.current);
    }
    timer.current = setTimeout(() => setIsVisible(false), durationMs);
  }, [durationMs]);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  return { isVisible, flash };
}
