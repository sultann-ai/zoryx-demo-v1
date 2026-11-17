import { useReorder } from '../../../cart/useReorder'
import { formatRs } from '../../../lib/format'
import { pick } from '../../../lib/localized'
import type { HistoryOrder } from '../../../lib/orderHistory'
import { useT } from '../../../i18n'
import { Fill } from '../../Fill'
import { Icon } from '../../Icon'
import { Button, ButtonRoute } from '../../ui/Button'
import { Card } from '../../ui/Card'

function PastOrderCard({ order }: { order: HistoryOrder }) {
  const { t, lang } = useT()
  const reorder = useReorder()
  // Western digits in both languages, like every other number on the site.
  const date = new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }).format(order.at)
  const names = order.items.map((i) => `${i.q > 1 ? `${i.q}× ` : ''}${pick(lang, i.n, i.u) ?? i.n}`)
  const shown = names.slice(0, 2).join('، ')
  const rest = names.length - 2
  return (
    <Card as="li" className="space-y-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <span dir="ltr" className="selectable rounded-full bg-band px-3 text-lg font-bold tracking-wider text-ink">
          {order.code}
        </span>
        <span className="text-muted">{date}</span>
      </div>
      {names.length > 0 && (
        <p className="line-clamp-2 text-ink">
          {shown}
          {rest > 0 && (
            <>
              {' '}
              <Fill text={t('home.moreItems')} values={{ n: String(rest) }} />
            </>
          )}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        <span dir="ltr" className="text-lg font-bold text-ink">
          {formatRs(order.total)}
        </span>
        <div className="flex items-center gap-2">
          <ButtonRoute to={`/order/${order.publicId}`} variant="secondary" size="sm" className="text-ink">
            {t('last.view')}
          </ButtonRoute>
          {order.lines && (
            <Button size="sm" onClick={() => reorder(order.lines ?? [])}>
              <Icon name="repeat" className="size-5" />
              <span>{t('home.reorder')}</span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

/** The orders placed from this phone (up to 10, kept on the phone), newest first, each with a Reorder button. */
export function PastOrders({ orders }: { orders: HistoryOrder[] }) {
  const { t } = useT()
  if (orders.length === 0) return null
  return (
    <section aria-labelledby="past-h" className="space-y-3">
      <h2 id="past-h" className="text-2xl">
        {t('orders.past')}
      </h2>
      <ul className="space-y-3">
        {orders.map((order) => (
          <PastOrderCard key={order.publicId} order={order} />
        ))}
      </ul>
    </section>
  )
}
