import { createContext, useContext } from 'react'
import type { CartLine } from './types'

export interface CartValue {
  lines: CartLine[]
  /** Total number of units across all lines. */
  count: number
  /** The line most recently removed (for the Undo toast), or null. */
  removed: CartLine | null
  add: (line: Omit<CartLine, 'qty'>, qty?: number) => void
  /** Setting 0 removes the line (and offers Undo). */
  setQty: (key: string, qty: number) => void
  undoRemove: () => void
  dismissRemoved: () => void
  /** Keep only the lines whose key is in the allowed set (an item vanished from the menu). */
  prune: (allowed: Set<string>) => void
  clear: () => void
  /** One request id per cart: created on first use, reused on every retry, discarded when the lines change. */
  ensureRequestId: () => string
  /** Force a new request id (the server said this one was already used for a different order). */
  resetRequestId: () => void
}

export const CartContext = createContext<CartValue | null>(null)

export function useCart(): CartValue {
  const value = useContext(CartContext)
  if (!value) throw new Error('useCart must be used inside <CartProvider>')
  return value
}
