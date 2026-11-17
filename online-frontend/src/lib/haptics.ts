import { useSyncExternalStore } from 'react'

// A tiny vibration on add-to-cart and when an order is placed. The Vibration API is missing on iPhones and on some
// browsers, so nothing ever depends on it: every call is guarded and silent. The switch lives in More > Settings.
const KEY = 'mc.haptics' // "0" when switched off; absent means on

let enabled = true
try {
  enabled = localStorage.getItem(KEY) !== '0'
} catch {
  /* default on */
}
const listeners = new Set<() => void>()

export const hapticsSupported = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export function vibrate(pattern: number | number[]): void {
  if (!enabled || !hapticsSupported()) return
  try {
    navigator.vibrate(pattern)
  } catch {
    /* blocked or unsupported: fine */
  }
}

export function setHaptics(on: boolean): void {
  enabled = on
  try {
    if (on) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, '0')
  } catch {
    /* kept for this visit */
  }
  listeners.forEach((l) => l())
  if (on) vibrate(15) // a little confirmation that it works
}

export function useHaptics(): boolean {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => enabled,
    () => true,
  )
}
