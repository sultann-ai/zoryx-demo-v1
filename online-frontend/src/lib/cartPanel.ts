import { useSyncExternalStore } from 'react'

// Phone shell: the Cart tab opens the cart (then checkout) from any page, so its state lives outside the Menu route.
export type CartPanelPhase = 'closed' | 'cart' | 'checkout'

let phase: CartPanelPhase = 'closed'
const listeners = new Set<() => void>()

export function setCartPanel(next: CartPanelPhase): void {
  if (next === phase) return
  phase = next
  listeners.forEach((notify) => notify())
}

export function useCartPanel(): CartPanelPhase {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => phase,
    () => 'closed',
  )
}
