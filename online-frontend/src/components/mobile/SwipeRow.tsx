import { useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

const REVEAL = 88 // px: width of the Delete action
const OPEN_AT = 40 // px dragged: past this the row stays open
const REMOVE_AT = 220 // px dragged: a long swipe removes the row outright (the Undo snackbar brings it back)
const SLOP = 8 // px before a touch counts as a horizontal drag

/**
 * Swipe a row toward the start edge to reveal a Delete action (mirrored in RTL). It is a shortcut only: the quantity
 * stepper going to 0 removes a line too, and the Delete button is a real, focusable button.
 * The row content keeps `touch-action: pan-y`, so vertical scrolling and the browser's edge-swipe back are untouched.
 */
export function SwipeRow({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
  const { t } = useT()
  const rtl = document.documentElement.dir === 'rtl'
  const sign = rtl ? 1 : -1 // which way the row slides
  const [offset, setOffset] = useState(0) // signed px
  const [dragging, setDragging] = useState(false)
  const gesture = useRef<{ x: number; y: number; base: number; live: boolean } | null>(null)
  const open = Math.abs(offset) >= REVEAL - 1

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as Element).closest('button, a, input')) return // steppers and links keep their own taps
    gesture.current = { x: event.clientX, y: event.clientY, base: offset, live: false }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current
    if (!g) return
    const dx = event.clientX - g.x
    const dy = event.clientY - g.y
    if (!g.live) {
      if (Math.abs(dy) > SLOP && Math.abs(dy) > Math.abs(dx)) return void (gesture.current = null) // a scroll, not a swipe
      if (Math.abs(dx) <= SLOP) return
      g.live = true
      setDragging(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    // Only toward the reveal side (sign), never past a long swipe.
    const moved = Math.min(Math.max(0, (g.base * sign + dx * sign)), REMOVE_AT + 40)
    setOffset(moved * sign)
  }
  const onPointerUp = () => {
    const g = gesture.current
    gesture.current = null
    if (!g?.live) {
      if (open) setOffset(0) // a tap on an open row closes it
      return
    }
    setDragging(false)
    const dist = Math.abs(offset)
    if (dist >= REMOVE_AT) onRemove()
    else setOffset(dist >= OPEN_AT ? REVEAL * sign : 0)
  }

  return (
    <div className="relative overflow-hidden rounded-card shadow-soft">
      <div className="absolute inset-y-0 end-0 flex w-[88px] items-stretch" aria-hidden={!open}>
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          onClick={onRemove}
          className="flex w-full flex-col items-center justify-center gap-1 bg-error text-on-action"
        >
          <Icon name="close" />
          <span className="text-sm font-bold">{t('cart.delete')}</span>
        </button>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ transform: `translateX(${offset}px)`, transition: dragging ? 'none' : undefined }}
        className="relative touch-pan-y select-none bg-surface text-ink transition-transform duration-[var(--dur-sheet)]"
      >
        {children}
      </div>
    </div>
  )
}
