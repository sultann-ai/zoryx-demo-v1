import { useSyncExternalStore } from 'react'

// One snackbar at a time, shown above the tab bar (or above a sheet's footer while a sheet is open). Used for cart
// removals (with Undo), copy confirmations and errors. A new toast replaces the one on screen.
export interface ToastData {
  id: number
  message: string
  kind: 'info' | 'success' | 'error'
  action?: { label: string; run: () => void }
}

interface ShowOptions {
  message: string
  kind?: ToastData['kind']
  action?: ToastData['action']
  /** How long it stays (ms). Default 3500; with an action 6000. */
  ms?: number
  /** Called once when it goes away for any reason (timeout, replaced, dismissed, or its action ran). */
  onClose?: () => void
}

let current: ToastData | null = null
let closeHook: (() => void) | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let nextId = 1
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function finish() {
  clearTimeout(timer)
  const hook = closeHook
  closeHook = undefined
  current = null
  emit()
  hook?.()
}

export function showToast({ message, kind = 'info', action, ms, onClose }: ShowOptions): void {
  if (current) finish() // replace: the old one's onClose still runs (e.g. the cart forgets its Undo)
  current = { id: nextId++, message, kind, action }
  closeHook = onClose
  timer = setTimeout(finish, ms ?? (action ? 6000 : 3500))
  emit()
}

export function dismissToast(): void {
  if (current) finish()
}

/** Run the toast's action (Undo), then close it. The action goes first: closing runs onClose, which for a cart removal forgets the line Undo is about to bring back. */
export function runToastAction(): void {
  const action = current?.action
  action?.run()
  finish()
}

export function useToast(): ToastData | null {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    () => current,
    () => null,
  )
}
