import { useEffect, useRef } from 'react'

// Sheets and modals get one history entry while they are open, so the browser / Android Back button closes them
// instead of leaving the site. cart -> checkout stays on the same entry because `active` never goes false in between.

interface LayerState {
  layer?: true
}

/**
 * Push a history entry while `active`; if the user goes Back, `onPop` is called (close the layer there).
 * Closing the layer in code (X, Escape, backdrop) removes the entry again, unless something replaced it meanwhile
 * (checkout does navigate(..., { replace: true }), which swaps the layer entry for the order page).
 * The pushed entry keeps the router's own state (key, idx), so React Router sees it as the same location and a
 * Back that only closes a layer changes no route and starts no page transition.
 */
export function useHistoryLayer(active: boolean, onPop: () => void): void {
  const owned = useRef(false)
  const ignorePop = useRef(false)
  const onPopRef = useRef(onPop)
  useEffect(() => {
    onPopRef.current = onPop
  })

  useEffect(() => {
    if (active && !owned.current) {
      const state: LayerState = { ...(window.history.state as object | null), layer: true }
      window.history.pushState(state, '')
      owned.current = true
    } else if (!active && owned.current) {
      owned.current = false
      if ((window.history.state as LayerState | null)?.layer) {
        ignorePop.current = true
        window.history.back()
      }
    }
  }, [active])

  useEffect(() => {
    const onPopState = () => {
      if (ignorePop.current) {
        ignorePop.current = false
        return
      }
      if (owned.current) {
        owned.current = false
        onPopRef.current()
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      owned.current = false
    }
  }, [])
}
