import { setCartPanel } from '../lib/cartPanel'
import { useCart } from './context'
import type { CartLine } from './types'

/**
 * "Order again": replace the cart with an earlier order's lines (ids + quantities only; the live menu supplies names and
 * prices, and anything no longer sold is dropped when the cart opens), then open the cart.
 */
export function useReorder(): (lines: CartLine[]) => void {
  const cart = useCart()
  return (lines) => {
    cart.clear()
    for (const line of lines) cart.add({ kind: line.kind, id: line.id, variantId: line.variantId, addOnIds: line.addOnIds }, line.qty)
    setCartPanel('cart')
  }
}
