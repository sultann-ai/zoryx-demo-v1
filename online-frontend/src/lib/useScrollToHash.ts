import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Scroll to the element named by the URL hash (/#find, /menu#sec-deals) once `ready` is true.
 * Runs a frame late so it wins over the shell's scroll-to-top on a route change, and respects reduced motion.
 */
export function useScrollToHash(ready = true) {
  const { hash } = useLocation()
  useEffect(() => {
    if (!hash || !ready) return
    const frame = requestAnimationFrame(() => {
      let target: Element | null = null
      try {
        target = document.querySelector(hash)
      } catch {
        return // not a valid selector
      }
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      target?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [hash, ready])
}
