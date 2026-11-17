import { useLayoutEffect, useRef } from 'react'

/**
 * Scroll-in, once: put the returned ref on a container and `.reveal-item` on its items. Before the first paint the
 * container is marked data-reveal="pending" (items hidden); when a sixth of it is on screen it becomes "done" and the
 * items fade and rise in one after another (index.css). Never again after that. Without IntersectionObserver, or with
 * reduced motion (the CSS only hides items when motion is allowed), everything simply shows.
 */
export function useRevealOnce<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node || node.dataset.reveal === 'done' || typeof IntersectionObserver === 'undefined') return
    node.dataset.reveal = 'pending'
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        node.dataset.reveal = 'done'
        observer.disconnect()
      },
      { threshold: 0.15 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  return ref
}
