import { useEffect, useState } from "react";

// The current time, re-read every `intervalMs` — for "seated 25m"-style labels that should tick
// without anything else changing.
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
