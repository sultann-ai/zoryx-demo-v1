import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react'
import { useT } from '../i18n'
import { useSheetLock } from '../lib/useSheetLock'
import { SheetToasts } from './mobile/ToastHost'
import { Icon } from './Icon'

const CLOSE_DISTANCE = 110 // px dragged down that closes the sheet
const CLOSE_VELOCITY = 0.6 // px/ms: a quick flick closes it too
const MIN_MS = 120 // the fastest a flicked sheet leaves
const MAX_MS = 280

/**
 * Bottom sheet on a native modal <dialog>: focus is trapped, Escape closes, the page behind is inert.
 * Mount it only while it should be open; onClose fires for Escape, the X and a tap on the backdrop.
 *
 * Phone options (the caller passes them only below 768px):
 * - `draggable`: a drag handle; pull the header down to close. The sheet follows the finger, and on release it leaves at
 *   the speed of the flick (or springs back), so it feels like it has weight.
 * - `tall`: opens at about 85% of the screen height.
 * - `page`: a full-screen page (no gap, no rounded corners, a back arrow instead of the X, safe-area aware).
 * Phones also get the entry animation (the sheet rises, a page slides in from the reading end), timed by the motion tokens.
 */
export function Sheet({
  title,
  onClose,
  footer,
  fullscreen = false,
  draggable = false,
  tall = false,
  page = false,
  children,
}: {
  title: string
  onClose: () => void
  footer?: ReactNode
  /** Covers the whole screen (checkout) instead of rising from the bottom. */
  fullscreen?: boolean
  draggable?: boolean
  tall?: boolean
  page?: boolean
  children: ReactNode
}) {
  const { t } = useT()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  // Where focus was when the sheet opened; handed back when it goes away, however it goes away.
  const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null)
  // y of the last pointer sample, its time, a smoothed downward velocity (px/ms) and the drag distance so far.
  const drag = useRef<{ startY: number; lastY: number; lastT: number; v: number; dy: number; active: boolean } | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    // Not re-shown if React's dev double-mount already opened it. No close() on cleanup: removing the dialog from
    // the DOM takes it out of the top layer, and close() would fire onClose and unmount the sheet again.
    if (!dialog.open) dialog.showModal()
    const back = opener.current
    return () => {
      if (back && back.isConnected) queueMicrotask(() => back.focus())
    }
  }, [])
  // No page scroll behind the sheet; the phone shell also hides its tab bar.
  useSheetLock()

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggable || (event.target as Element).closest('button')) return
    drag.current = { startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, v: 0, dy: 0, active: true }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (ref.current) ref.current.style.transition = 'none'
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state?.active || !ref.current) return
    state.dy = Math.max(0, event.clientY - state.startY) // only downwards
    const dt = Math.max(1, event.timeStamp - state.lastT)
    state.v = 0.7 * state.v + 0.3 * ((event.clientY - state.lastY) / dt) // smoothed, so one jittery sample does not decide
    state.lastY = event.clientY
    state.lastT = event.timeStamp
    ref.current.style.transform = `translateY(${state.dy}px)`
  }
  const endDrag = () => {
    const state = drag.current
    const dialog = ref.current
    drag.current = null
    if (!state?.active || !dialog) return
    const animate = !reduceMotion()
    if (state.dy > CLOSE_DISTANCE || (state.dy > 24 && state.v > CLOSE_VELOCITY)) {
      // Leave at the speed of the flick: the faster the throw, the shorter the remaining travel time.
      const remaining = Math.max(0, dialog.offsetHeight - state.dy)
      const ms = animate ? Math.min(MAX_MS, Math.max(MIN_MS, remaining / Math.max(state.v, 0.9))) : 0
      dialog.style.transition = `transform ${ms}ms var(--ease-out)`
      dialog.style.transform = 'translateY(100%)'
      window.setTimeout(() => dialog.close(), ms)
    } else {
      dialog.style.transition = 'transform var(--dur-sheet) var(--ease-out)'
      dialog.style.transform = ''
    }
  }

  const size = page
    ? 'sheet-page m-0 h-dvh max-h-none w-full max-w-none rounded-none'
    : fullscreen
      ? 'sheet-rise mx-auto mb-0 mt-auto h-[calc(100dvh-max(12px,env(safe-area-inset-top)))] max-h-none w-full max-w-2xl rounded-t-sheet'
      : tall
        ? 'sheet-rise mx-auto mb-0 mt-auto h-[85dvh] max-h-[92dvh] w-full max-w-xl rounded-t-sheet'
        : 'sheet-rise mx-auto mb-0 mt-auto max-h-[92dvh] w-full max-w-xl rounded-t-sheet'

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
      className={`flex-col overflow-hidden overscroll-contain bg-canvas p-0 text-ink open:flex backdrop:bg-ink/60 ${size}`}
    >
      {/* Header: the drag area. touch-none so a vertical drag is ours, not the browser's scroll. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={draggable ? 'touch-none' : undefined}
      >
        {draggable && <span aria-hidden="true" className="mx-auto mt-2 block h-1.5 w-12 rounded-full bg-ink/25" />}
        <div className={`flex items-center gap-3 px-4 ${page ? 'pt-[max(0.5rem,env(safe-area-inset-top))]' : 'pt-3'}`}>
          {page && (
            <button
              type="button"
              autoFocus
              onClick={() => ref.current?.close()}
              aria-label={t('nav.back')}
              className="flex size-tap shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-soft"
            >
              <Icon name="arrow" flip />
            </button>
          )}
          <h2 id={titleId} className="line-clamp-2 min-w-0 flex-1 text-2xl leading-tight">
            {title}
          </h2>
          {!page && (
            <button
              type="button"
              autoFocus
              onClick={() => ref.current?.close()}
              aria-label={t('gallery.close')}
              className="flex size-tap shrink-0 items-center justify-center rounded-full border border-ink text-ink"
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>
      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-3 ${footer ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}
      >
        {children}
      </div>
      <SheetToasts />
      {footer && <div className="bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-soft">{footer}</div>}
    </dialog>
  )
}
