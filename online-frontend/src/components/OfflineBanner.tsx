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

export function OfflineBanner() {
  const { t } = useT()
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
  if (online) return null
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-error px-4 py-2 text-center text-on-action">
      <Icon name="wifi-off" />
      <span>{t('net.offline')}</span>
    </div>
  )
}
