import { useEffect, useRef, useState } from 'react'

const TRIGGER = 72 // px of pull that starts a refresh
const MAX_PULL = 110
const RESISTANCE = 0.5

/**
 * A simple pull-to-refresh for touch screens: at the very top of the page, drag down past 72px and let go.
 * `pull` is the current drag distance (px) for drawing the spinner, `refreshing` is true while `onRefresh` runs.
 * Does nothing without a coarse pointer (so a mouse or trackpad never triggers it). The page keeps its own scrolling:
 * the shell already sets overscroll-behavior: contain, so the browser's own pull-to-reload does not compete.
 */
export function usePullToRefresh(onRefresh: () => Promise<unknown>): { pull: number; refreshing: boolean } {
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const run = useRef(onRefresh)
  useEffect(() => {
    run.current = onRefresh
  })

  useEffect(() => {
    if (!window.matchMedia('(pointer: coarse)').matches) return
    let startY: number | null = null
    let distance = 0
    let busy = false

    const onStart = (event: TouchEvent) => {
      startY = window.scrollY <= 0 && !busy && event.touches.length === 1 ? event.touches[0].clientY : null
      distance = 0
    }
    const onMove = (event: TouchEvent) => {
      if (startY === null) return
      const dy = event.touches[0].clientY - startY
      if (dy <= 0 || window.scrollY > 0) {
        if (distance !== 0) setPull(0)
        distance = 0
        return
      }
      distance = Math.min(MAX_PULL, dy * RESISTANCE)
      setPull(distance)
    }
    const onEnd = () => {
      if (startY === null) return
      startY = null
      if (distance >= TRIGGER * RESISTANCE && !busy) {
        busy = true
        setRefreshing(true)
        setPull(TRIGGER * RESISTANCE)
        void Promise.resolve(run.current()).finally(() => {
          busy = false
          setRefreshing(false)
          setPull(0)
        })
      } else {
        setPull(0)
      }
      distance = 0
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return { pull, refreshing }
}
