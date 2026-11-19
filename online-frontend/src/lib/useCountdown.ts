import { useEffect, useState } from 'react'

/** Whole seconds left until `deadline` (a Date.now() value), ticking once a second; 0 once it has passed. */
export function useCountdown(deadline: number): number {
  const [now, setNow] = useState(() => Date.now())
  const left = Math.max(0, Math.ceil((deadline - now) / 1000))
  useEffect(() => {
    if (deadline <= Date.now()) return
    const tick = () => {
      setNow(Date.now())
      if (Date.now() >= deadline) window.clearInterval(timer)
    }
    // Catch up at once (the clock may have stood still since the last countdown ended), then once a second.
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [deadline])
  return left
}

/** "0:42" — for a short wait. */
export const formatWait = (seconds: number): string => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
