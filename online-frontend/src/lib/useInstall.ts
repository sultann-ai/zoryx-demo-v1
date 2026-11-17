import { useSyncExternalStore } from 'react'

// Android / desktop Chrome offer an install prompt through `beforeinstallprompt`. It can fire before any screen is
// mounted, so it is captured here at start-up (this module is imported by the app shell) and used later by the More tab.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // keep it for our own button
    deferred = event as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** True when the browser can show its own install dialog right now. */
export function useCanPromptInstall(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => deferred !== null,
    () => false,
  )
}

/** Shows the browser's install dialog. Resolves true if the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = null
  notify() // the prompt can only be used once
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}

export const isIOSDevice = (): boolean =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
