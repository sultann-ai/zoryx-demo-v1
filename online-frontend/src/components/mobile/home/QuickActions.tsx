import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { phoneHref, waHref } from '../../../lib/config'
import { useShopMapUrl, useShopWhatsApp } from '../../../lib/useShopContact'
import { useShopPhone } from '../../../lib/useShopPhone'
import { useT } from '../../../i18n'
import { Icon, type IconName } from '../../Icon'

const round = 'flex size-14 items-center justify-center rounded-full shadow-soft transition-transform motion-safe:active:scale-95'
const label = 'text-sm font-semibold leading-tight text-ink'

function Action({ icon, text, primary = false, children }: { icon: IconName; text: string; primary?: boolean; children: (inner: ReactNode) => ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col items-center gap-1 text-center">
      {children(
        <>
          <span className={`${round} ${primary ? 'bg-action text-on-action' : 'bg-surface text-ink'}`}>
            <Icon name={icon} className="size-7" />
          </span>
          <span className={label}>{text}</span>
        </>,
      )}
    </li>
  )
}

/** Round buttons with labels: Order now, Call, WhatsApp, Directions. Each one is a single 56px+ tap target with its label. */
export function QuickActions() {
  const { t } = useT()
  const phone = useShopPhone()
  const whatsapp = useShopWhatsApp()
  const mapUrl = useShopMapUrl()
  const column = 'flex min-h-touch flex-col items-center gap-1'
  return (
    <ul className="grid grid-cols-4 gap-1">
      <Action icon="bag" text={t('nav.orderNow')} primary>
        {(inner) => (
          <Link to="/menu" className={column}>
            {inner}
          </Link>
        )}
      </Action>
      <Action icon="phone" text={t('home.qa.call')}>
        {(inner) => (
          <a href={phoneHref(phone)} aria-label={`${t('contact.call')} ${phone}`} className={column}>
            {inner}
          </a>
        )}
      </Action>
      {whatsapp && (
        <Action icon="whatsapp" text={t('home.qa.whatsapp')}>
          {(inner) => (
            <a href={waHref(whatsapp)} target="_blank" rel="noopener noreferrer" aria-label={t('contact.whatsapp')} className={column}>
              {inner}
            </a>
          )}
        </Action>
      )}
      {mapUrl && (
        <Action icon="pin" text={t('home.qa.directions')}>
          {(inner) => (
            <a href={mapUrl} target="_blank" rel="noopener noreferrer" aria-label={t('find.map')} className={column}>
              {inner}
            </a>
          )}
        </Action>
      )}
    </ul>
  )
}
