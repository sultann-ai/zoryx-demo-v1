import { useEffect, useLayoutEffect } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Phone shell: every tab keeps its own scroll position, and Back to an inner page lands where you left it.
// Tab roots are keyed by path (so re-opening Menu returns to where Menu was); other pages by history entry.
const positions = new Map<string, number>()

export const TAB_ROOTS = ['/', '/menu', '/orders', '/more'] as const

const keyFor = (pathname: string, locationKey: string) => ((TAB_ROOTS as readonly string[]).includes(pathname) ? pathname : locationKey)

// The page whose scroll we are tracking. Set in a layout effect, before the new page is scrolled to the top, so a late
// scroll event from that jump is never filed under the page we just left.
let current = ''

export function useScrollMemory(): void {
  const { pathname, key, hash, search } = useLocation()
  const type = useNavigationType()
  const memKey = keyFor(pathname, key)
  const isTab = (TAB_ROOTS as readonly string[]).includes(pathname)

  // Remember: one passive listener per page, flushed on animation frames.
  useEffect(() => {
    let frame = 0
    const onScroll = () => {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          if (current === memKey) positions.set(memKey, window.scrollY)
        })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [memKey])

  // Restore (or start at the top). A link to a section (/#find, /menu#sec-x) scrolls itself, see useScrollToHash.
  useLayoutEffect(() => {
    current = memKey
    if (hash) return
    // /menu?filter=popular is a different view of the Menu tab: it starts at the top, it does not inherit the Menu's position.
    const target = !search && (isTab || type === 'POP') ? (positions.get(memKey) ?? 0) : 0
    window.scrollTo(0, target)
    if (target === 0) return
    // The page may still be growing (images, lazy sections): retry for a few frames until it can scroll that far.
    let frames = 0
    let frame = requestAnimationFrame(function retry() {
      if (Math.abs(window.scrollY - target) > 2 && frames++ < 12) {
        window.scrollTo(0, target)
        frame = requestAnimationFrame(retry)
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [memKey, hash, search, isTab, type])
}
