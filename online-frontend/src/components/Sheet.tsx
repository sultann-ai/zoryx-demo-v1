import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useT } from '../i18n'
import { useSheetLock } from '../lib/useSheetLock'
import { SheetToasts } from './mobile/ToastHost'
import { Icon } from './Icon'

const CLOSE_DISTANCE = 110 // px dragged down that closes the sheet
const CLOSE_VELOCITY = 0.6 // px/ms: a quick flick closes it too
const EXPAND_DISTANCE = 48 // px dragged up that expands a sheet that is smaller than the screen
const EXPAND_VELOCITY = 0.5 // px/ms: a quick flick up expands it too
const MIN_MS = 120 // the fastest a flicked sheet leaves
const MAX_MS = 280
const SETTLE_MS = 260 // slightly above --dur-sheet, for the timeout that ends a height animation

const TEXT_FIELD = 'textarea, select, input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=range],[type=file],[type=color])'

/**
 * Bottom sheet on a native modal <dialog>: focus is trapped, Escape closes, the page behind is inert.
 * Mount it only while it should be open; onClose fires for Escape, the X and a tap on the backdrop.
 *
 * Layout: the sheet is as tall as its content, up to 90% of the visible height; the header and the footer (the action
 * button) are pinned and only the body between them scrolls (`touch-action: pan-y`, no scroll chaining to the page).
 * While a text field has the keyboard the sheet may use the whole visible height, and the focused field (and a field's
 * error as soon as it appears) is scrolled into the body's visible part.
 *
 * Phone options (the caller passes them only below 768px):
 * - `draggable`: a drag handle. Only the handle and the header take the drag, never the body. Pull down past a threshold
 *   (or flick) to close, a shorter pull springs back; pull up to expand a sheet that has more content than it shows.
 *   The sheet follows the finger, and on release it leaves at the speed of the flick, so it feels like it has weight.
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
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  // Pulled up to (nearly) the full visible height; the class below keeps it there, also when the keyboard resizes the page.
  const [expanded, setExpanded] = useState(false)
  // Where focus was when the sheet opened; handed back when it goes away, however it goes away.
  const opener = useRef<HTMLElement | null>(document.activeElement as HTMLElement | null)
  // The drag so far: y of the last pointer sample, its time, a smoothed downward velocity (px/ms), the signed distance
  // (down is positive) and the height the sheet had when the finger landed.
  const drag = useRef<{ startY: number; lastY: number; lastT: number; v: number; dy: number; startH: number; canExpand: boolean } | null>(null)

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

  // The visible area, not the layout viewport. Android Chrome (interactive-widget=resizes-content) already shrinks dvh with
  // the keyboard; iOS Safari only shrinks the visual viewport, so the sheet is measured against that and lifted above the
  // keyboard. `--sheet-vh` / `--sheet-lift` exist only while the two differ; otherwise the dvh fallbacks apply.
  useEffect(() => {
    const dialog = ref.current
    const vv = window.visualViewport
    if (!dialog || !vv) return
    const sync = () => {
      const hidden = window.innerHeight - vv.height
      if (vv.scale > 1.01 || hidden < 2) {
        dialog.style.removeProperty('--sheet-vh')
        dialog.style.removeProperty('--sheet-lift')
        return
      }
      dialog.style.setProperty('--sheet-vh', `${Math.round(vv.height)}px`)
      dialog.style.setProperty('--sheet-lift', `${Math.max(0, Math.round(hidden - vv.offsetTop))}px`)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  // Keep what the person is working on in view: the focused field when the keyboard (or anything else) changes the
  // body's height, and a field's error the moment it shows up. Only the body scrolls, never the dialog or the page.
  useEffect(() => {
    const dialog = ref.current
    const body = bodyRef.current
    if (!dialog || !body) return
    const reduce = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const reveal = (target: Element | null) => {
      if (!target || !body.contains(target)) return
      const wrap = target.closest('[data-field]') ?? target // label, control, hint and error together
      const box = body.getBoundingClientRect()
      const rect = wrap.getBoundingClientRect()
      const pad = 8
      let delta = 0
      // A block taller than the body shows its end (the control and its error), not its label.
      if (rect.height > box.height - 2 * pad) delta = rect.bottom - (box.bottom - pad)
      else if (rect.top < box.top + pad) delta = rect.top - (box.top + pad)
      else if (rect.bottom > box.bottom - pad) delta = rect.bottom - (box.bottom - pad)
      if (Math.abs(delta) > 1) body.scrollBy({ top: delta, behavior: reduce() ? 'auto' : 'smooth' })
    }
    const typing = () => {
      const el = document.activeElement
      return el instanceof HTMLElement && dialog.contains(el) && el.matches(TEXT_FIELD) ? el : null
    }
    let timer = 0
    const later = (fn: () => void, ms: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(fn, ms)
    }
    const onIn = () => {
      const field = typing()
      if (field) dialog.dataset.kb = ''
      later(() => reveal(typing()), 280) // after the keyboard has started to slide in
    }
    const onOut = () => {
      // Focus moving from one field to the next is not the keyboard closing.
      window.setTimeout(() => {
        if (!typing()) delete dialog.dataset.kb
      }, 0)
    }
    // A new error (aria-invalid flips on, or an alert appears) is scrolled into view once, not on every keystroke.
    let shown: Element | null = null
    // The body changed height (keyboard in or out, the sheet resizing): keep the focused field, or else the error, in view.
    const resized = new ResizeObserver(() => later(() => reveal(typing() ?? shown), 60))
    resized.observe(body)
    const errors = new MutationObserver(() => {
      const bad = body.querySelector('[aria-invalid="true"], [role="alert"]')
      if (bad !== shown) {
        shown = bad
        if (bad) requestAnimationFrame(() => reveal(bad))
      }
    })
    errors.observe(body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-invalid'] })
    dialog.addEventListener('focusin', onIn)
    dialog.addEventListener('focusout', onOut)
    return () => {
      window.clearTimeout(timer)
      resized.disconnect()
      errors.disconnect()
      dialog.removeEventListener('focusin', onIn)
      dialog.removeEventListener('focusout', onOut)
    }
  }, [])

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const dialog = ref.current
    const body = bodyRef.current
    if (!draggable || !dialog || !body || (event.target as Element).closest('button')) return
    // Only a sheet that is shorter than the screen and hides content can grow.
    const canExpand = !expanded && !page && !fullscreen && body.scrollHeight > body.clientHeight + 1
    drag.current = { startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, v: 0, dy: 0, startH: dialog.offsetHeight, canExpand }
    event.currentTarget.setPointerCapture(event.pointerId)
    dialog.style.transition = 'none'
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const dialog = ref.current
    if (!state || !dialog) return
    state.dy = event.clientY - state.startY
    const dt = Math.max(1, event.timeStamp - state.lastT)
    state.v = 0.7 * state.v + 0.3 * ((event.clientY - state.lastY) / dt) // smoothed, so one jittery sample does not decide
    state.lastY = event.clientY
    state.lastT = event.timeStamp
    if (state.dy > 0 || !state.canExpand) {
      dialog.style.transform = `translateY(${Math.max(0, state.dy)}px)` // down: the sheet follows the finger
      if (state.canExpand) dialog.style.height = `${state.startH}px`
    } else {
      // Up: the sheet grows with the finger, never past the full height (CSS min() holds the limit).
      dialog.style.transform = ''
      dialog.style.maxHeight = 'none'
      dialog.style.height = `min(${state.startH - state.dy}px, var(--sheet-full))`
    }
  }
  /** Animate to a height, then hand the sheet back to its classes (the inline height must not outlive the gesture). */
  const settleHeight = (to: string, expand: boolean) => {
    const dialog = ref.current
    if (!dialog) return
    const ms = reduceMotion() ? 0 : SETTLE_MS
    dialog.style.transition = `height ${ms}ms var(--ease-out), transform ${ms}ms var(--ease-out)`
    dialog.style.transform = ''
    dialog.style.maxHeight = 'none'
    dialog.style.height = to
    window.setTimeout(() => {
      if (expand) setExpanded(true)
      dialog.style.transition = ''
      dialog.style.height = ''
      dialog.style.maxHeight = ''
    }, ms)
  }
  const endDrag = () => {
    const state = drag.current
    const dialog = ref.current
    drag.current = null
    if (!state || !dialog) return
    const animate = !reduceMotion()
    if (state.dy > CLOSE_DISTANCE || (state.dy > 24 && state.v > CLOSE_VELOCITY)) {
      // Leave at the speed of the flick: the faster the throw, the shorter the remaining travel time.
      const remaining = Math.max(0, dialog.offsetHeight - state.dy)
      const ms = animate ? Math.min(MAX_MS, Math.max(MIN_MS, remaining / Math.max(state.v, 0.9))) : 0
      dialog.style.transition = `transform ${ms}ms var(--ease-out)`
      dialog.style.transform = 'translateY(100%)'
      window.setTimeout(() => dialog.close(), ms)
    } else if (state.canExpand && (-state.dy > EXPAND_DISTANCE || (-state.dy > 16 && state.v < -EXPAND_VELOCITY))) {
      settleHeight('var(--sheet-full)', true)
    } else if (state.canExpand && state.dy < 0) {
      settleHeight(`${state.startH}px`, false)
    } else {
      dialog.style.transition = 'transform var(--dur-sheet) var(--ease-out)'
      dialog.style.transform = ''
      if (state.canExpand) {
        dialog.style.height = ''
        dialog.style.maxHeight = ''
      }
    }
  }

  // --sheet-vh: the visible height (dvh unless the keyboard hides part of the layout viewport); --sheet-max: 90% of it,
  // or all of it but a 12px gap while a field has the keyboard; --sheet-full: what an expanded sheet fills.
  const size = page
    ? 'sheet-page m-0 h-[var(--sheet-vh,100dvh)] max-h-none w-full max-w-none rounded-none'
    : fullscreen
      ? 'sheet-rise mx-auto mb-[var(--sheet-lift,0px)] mt-auto h-[var(--sheet-full)] max-h-none w-full max-w-2xl rounded-t-sheet'
      : expanded
        ? 'sheet-rise mx-auto mb-[var(--sheet-lift,0px)] mt-auto h-[var(--sheet-full)] max-h-none w-full max-w-xl rounded-t-sheet'
        : tall
          ? 'sheet-rise mx-auto mb-[var(--sheet-lift,0px)] mt-auto h-[min(calc(var(--sheet-vh,100dvh)*0.85),var(--sheet-max))] max-h-[var(--sheet-max)] w-full max-w-xl rounded-t-sheet'
          : 'sheet-rise mx-auto mb-[var(--sheet-lift,0px)] mt-auto max-h-[var(--sheet-max)] w-full max-w-xl rounded-t-sheet'

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close()
      }}
      className={`flex-col overflow-hidden overscroll-contain bg-canvas p-0 text-ink [--sheet-full:calc(var(--sheet-vh,100dvh)-max(12px,env(safe-area-inset-top)))] [--sheet-max:calc(var(--sheet-vh,100dvh)*0.9)] open:flex backdrop:bg-ink/60 data-[kb]:[--sheet-max:calc(var(--sheet-vh,100dvh)-12px)] ${size}`}
    >
      {/* Header: the drag area (handle + title row). touch-none so a vertical drag here is ours, not the browser's scroll;
          select-none so a long press on it does not start a text selection. The body below is not part of it. */}
      <div
        data-sheet-header
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`shrink-0 ${draggable ? 'touch-none select-none' : ''}`}
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
      {/* Body: the only part that scrolls. flex-auto + min-h-0 lets it shrink under the max height instead of pushing the
          footer out; pan-y keeps the browser's own vertical scrolling here and nothing chains out to the page. */}
      <div
        ref={bodyRef}
        data-sheet-body
        className={`min-h-0 flex-auto touch-pan-y overflow-y-auto overscroll-contain px-4 pt-3 ${footer ? 'pb-3' : 'pb-[max(0.75rem,env(safe-area-inset-bottom))]'}`}
      >
        {children}
      </div>
      <SheetToasts />
      {footer && <div data-sheet-footer className="shrink-0 bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-soft">{footer}</div>}
    </dialog>
  )
}
