import { useEffect } from 'react'

// A modal is open: the page behind does not scroll and the phone shell hides its tab bar (html[data-sheet-open]).
let locks = 0

export function useSheetLock(active = true): void {
  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    locks += 1
    root.style.overflow = 'hidden'
    root.dataset.sheetOpen = ''
    return () => {
      locks -= 1
      if (locks === 0) {
        root.style.overflow = ''
        delete root.dataset.sheetOpen
      }
    }
  }, [active])
}
