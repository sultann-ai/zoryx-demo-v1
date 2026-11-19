import { useSyncExternalStore } from 'react'
import { useT } from '../i18n'
import { Icon } from './Icon'

function subscribe(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** `message` replaces the default "you are offline, you can also call us" (the table QR pages say what is kept). */
export function OfflineBanner({ message, className = '' }: { message?: string; className?: string }) {
  const { t } = useT()
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <div role="status" className={`flex items-center justify-center gap-2 bg-error px-4 py-2 text-center text-on-action ${className}`}>
      <Icon name="wifi-off" />
      <span>{message ?? t('net.offline')}</span>
    </div>
  )
}
