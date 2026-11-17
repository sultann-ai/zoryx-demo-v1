import { Link } from 'react-router-dom'
import { useStore } from '../../api/store'
import { readLastOrder } from '../../lib/lastOrder'
import { pick } from '../../lib/localized'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

/** Calm notice when ordering is closed: the reason, the hours, and the fact that the cart still works. */
export function ClosedBanner() {
  const { t, lang } = useT()
  const { data } = useStore()
  if (!data || data.orderingOpen) return null
  const hours = pick(lang, data.settings.openingHoursEn, data.settings.openingHoursUr)
  const reasonKey = data.closedReason ? (`home.closed.${data.closedReason}` as const) : 'home.closed.unknown'
  return (
    <div role="status" className="card mx-auto mt-4 flex max-w-page gap-3 p-4 text-ink">
      <Icon name="clock" className="mt-2 size-7 text-accent" />
      <div>
        <p className="font-bold text-accent">{t(reasonKey)}</p>
        {hours && (
          <p>
            {t('home.hoursLabel')}: {hours}
          </p>
        )}
        <p>{t('menu.closedBody')}</p>
      </div>
    </div>
  )
}

/** "Your last order: K7P2M - view", from localStorage (written by checkout in the next module). */
export function LastOrderBanner() {
  const { t } = useT()
  const last = readLastOrder()
  if (!last) return null
  return (
    <Link
      to={`/order/${last.publicId}`}
      className="card mx-auto mt-4 flex min-h-touch max-w-page items-center justify-between gap-3 px-4 text-ink"
    >
      <span>
        {t('last.label')}: <span dir="ltr" className="font-bold">{last.code}</span>
      </span>
      <span className="inline-flex items-center gap-1 font-bold underline">
        {t('last.view')}
        <Icon name="arrow" mirror />
      </span>
    </Link>
  )
}
