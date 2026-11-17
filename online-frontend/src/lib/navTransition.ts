import { flushSync } from 'react-dom'

// Direction-aware page transitions for the phone shell (150-300 ms, off under prefers-reduced-motion).
// View Transitions API where it exists; otherwise MobileShell plays a short CSS enter animation on <main>
// (.page-enter in index.css). Both read `html[data-nav]` / `main[data-enter]` and mirror in RTL through --dir.

export type NavDirection = 'forward' | 'back' | 'tab'

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => Promise<void>) => { finished: Promise<void> }
}

const COMMIT_TIMEOUT_MS = 400 // never leave the page frozen if the route does not change

let commit: (() => void) | null = null

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// iOS Safari already animates its own edge-swipe back; animating the Back again would play twice.
export const isIOS = (): boolean =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/**
 * Run `update` (which navigates) inside a view transition. `update` must start the navigation; with `awaitCommit`
 * (history.go / navigate(-1), which finish on a later popstate) the transition waits for `navigationCommitted()`.
 * Without view-transition support (or with reduced motion) it just runs `update`, and MobileShell's CSS animation
 * reads `html[data-nav]` for the direction.
 */
export function navigateWithTransition(direction: NavDirection, update: () => void, awaitCommit = false): void {
  const root = document.documentElement
  root.dataset.nav = direction
  const doc = document as ViewTransitionDocument
  if (!doc.startViewTransition || reducedMotion()) {
    update()
    return
  }
  root.dataset.vt = ''
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const done = () => {
          clearTimeout(timer)
          commit = null
          resolve()
        }
        const timer = setTimeout(done, COMMIT_TIMEOUT_MS)
        if (awaitCommit) {
          commit = done
          update()
        } else {
          flushSync(update) // the new page must be in the DOM before the transition takes its "after" picture
          done()
        }
      }),
  )
  void transition.finished.finally(() => {
    delete root.dataset.vt
    delete root.dataset.nav
  })
}

/** The new route is on screen: let a waiting transition play. */
export function navigationCommitted(): void {
  commit?.()
}

/** Which way a link to `toPath` moves: between two tab roots it is a cross-fade, anything else slides in. */
export function directionFor(fromPath: string, toPath: string, tabRoots: readonly string[]): NavDirection {
  return tabRoots.includes(fromPath) && tabRoots.includes(toPath) ? 'tab' : 'forward'
}
