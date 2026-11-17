import { useSyncExternalStore } from 'react'

// Phones get the app shell. 767px matches Tailwind's md (768px) split used everywhere else in the CSS.
const PHONE_QUERY = '(max-width: 767px)'
const STANDALONE_QUERY = '(display-mode: standalone)'

function subscribeTo(query: string) {
  return (notify: () => void) => {
    if (typeof window.matchMedia !== 'function') return () => {}
    const list = window.matchMedia(query)
    list.addEventListener('change', notify)
    return () => list.removeEventListener('change', notify)
  }
}

const matches = (query: string) => () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches

const subscribePhone = subscribeTo(PHONE_QUERY)
const subscribeStandalone = subscribeTo(STANDALONE_QUERY)
const isPhone = matches(PHONE_QUERY)

/** True below 768px: the app shell (app bar + tab bar) replaces the website header/footer. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribePhone, isPhone, () => false)
}

/** Installed to the home screen (Android/desktop display-mode, or iOS navigator.standalone). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const ios = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios || matches(STANDALONE_QUERY)()
}

export function useStandalone(): boolean {
  return useSyncExternalStore(subscribeStandalone, isStandalone, () => false)
}
