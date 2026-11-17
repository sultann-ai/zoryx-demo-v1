import { useEffect, useState } from 'react'
import { phoneHref } from '../lib/config'
import { useShopPhone } from '../lib/useShopPhone'
import { useT } from '../i18n'
import { Icon } from './Icon'

/** Appears under a loading skeleton after a few seconds, so a slow connection never feels like a dead page. */
export function SlowHint({ afterMs = 8000 }: { afterMs?: number }) {
  const { t } = useT()
  const phone = useShopPhone()
  const [show, setShow] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setShow(true), afterMs)
    return () => clearTimeout(timer)
  }, [afterMs])
  if (!show) return null
  return (
    <p role="status" className="flex flex-wrap items-center gap-2">
      <span>{t('err.slow')}</span>
      <a href={phoneHref(phone)} className="inline-flex min-h-touch items-center gap-2 font-bold text-ink underline">
        <Icon name="phone" />
        <span dir="ltr">{phone}</span>
      </a>
    </p>
  )
}
