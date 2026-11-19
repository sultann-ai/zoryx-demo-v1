import { useCallback, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { uuid } from '../lib/uuid'
import { CartContext } from './context'
import { loadCart, saveCart, WEBSITE_CART, type CartStorage } from './storage'
import { lineKey, MAX_QTY, type CartLine } from './types'
import { vibrate } from '../lib/haptics'

interface State {
  lines: CartLine[]
  removed: CartLine | null
  rid: string | null
}

type Action =
  | { type: 'add'; line: Omit<CartLine, 'qty'>; qty: number }
  | { type: 'setQty'; key: string; qty: number }
  | { type: 'undo' }
  | { type: 'dismiss' }
  | { type: 'prune'; allowed: Set<string> }
  | { type: 'clear' }
  | { type: 'rid'; rid: string | null }

const clamp = (qty: number) => Math.max(0, Math.min(MAX_QTY, Math.floor(qty)))

function reducer(state: State, action: Action): State {
  if (action.type === 'rid') return { ...state, rid: action.rid }
  const next = apply(state, action)
  // Any change to the lines makes it a different order, so it gets a fresh request id.
  return next.lines === state.lines ? next : { ...next, rid: null }
}

function apply(state: State, action: Exclude<Action, { type: 'rid' }>): State {
  switch (action.type) {
    case 'add': {
      const key = lineKey(action.line)
      const existing = state.lines.find((l) => lineKey(l) === key)
      if (existing) {
        return {
          ...state,
          lines: state.lines.map((l) => (l === existing ? { ...l, qty: clamp(l.qty + action.qty) } : l)),
        }
      }
      return { ...state, lines: [...state.lines, { ...action.line, qty: clamp(action.qty) }] }
    }
    case 'setQty': {
      const target = state.lines.find((l) => lineKey(l) === action.key)
      if (!target) return state
      const qty = clamp(action.qty)
      if (qty === 0) return { ...state, lines: state.lines.filter((l) => l !== target), removed: target }
      return { ...state, lines: state.lines.map((l) => (l === target ? { ...l, qty } : l)) }
    }
    case 'undo':
      if (!state.removed) return state
      return { ...state, lines: [...state.lines, state.removed], removed: null }
    case 'dismiss':
      return state.removed ? { ...state, removed: null } : state
    case 'prune': {
      const lines = state.lines.filter((l) => action.allowed.has(lineKey(l)))
      return lines.length === state.lines.length ? state : { ...state, lines }
    }
    case 'clear':
      return { lines: [], removed: null, rid: null }
  }
}

/**
 * The website's cart (default), or a table's: the table QR pages nest a second provider with their own storage, so a
 * guest's table order never mixes with a delivery cart on the same phone. Mount it keyed by `storage.key`.
 */
export function CartProvider({ storage = WEBSITE_CART, children }: { storage?: CartStorage; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, (): State => ({ ...loadCart(storage), removed: null }))
  const ridRef = useRef<string | null>(state.rid)

  useEffect(() => {
    ridRef.current = state.rid
    saveCart(storage, state.lines, state.rid)
  }, [storage, state.lines, state.rid])

  const add = useCallback((line: Omit<CartLine, 'qty'>, qty = 1) => {
    dispatch({ type: 'add', line, qty })
    vibrate(12) // a tiny tick where the phone supports it
  }, [])
  const setQty = useCallback((key: string, qty: number) => dispatch({ type: 'setQty', key, qty }), [])
  const undoRemove = useCallback(() => dispatch({ type: 'undo' }), [])
  const dismissRemoved = useCallback(() => dispatch({ type: 'dismiss' }), [])
  const prune = useCallback((allowed: Set<string>) => dispatch({ type: 'prune', allowed }), [])
  const clear = useCallback(() => dispatch({ type: 'clear' }), [])
  const ensureRequestId = useCallback(() => {
    if (!ridRef.current) {
      ridRef.current = uuid()
      dispatch({ type: 'rid', rid: ridRef.current })
    }
    return ridRef.current
  }, [])
  const resetRequestId = useCallback(() => {
    ridRef.current = null
    dispatch({ type: 'rid', rid: null })
  }, [])

  const value = useMemo(
    () => ({
      lines: state.lines,
      count: state.lines.reduce((sum, l) => sum + l.qty, 0),
      removed: state.removed,
      add,
      setQty,
      undoRemove,
      dismissRemoved,
      prune,
      clear,
      ensureRequestId,
      resetRequestId,
    }),
    [state, add, setQty, undoRemove, dismissRemoved, prune, clear, ensureRequestId, resetRequestId],
  )
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
