import { useState } from 'react'
import { isFinalStatus, useOrderStatus, type OrderStatus } from '../../../api/orders'
import { useReorder } from '../../../cart/useReorder'
import type { CartLine } from '../../../cart/types'
import { formatRs } from '../../../lib/format'
import { readLastOrder } from '../../../lib/lastOrder'
import { pick } from '../../../lib/localized'
import { useT, type TranslationKey } from '../../../i18n'
import { Fill } from '../../Fill'
import { Icon } from '../../Icon'
import { Skeleton } from '../../Skeleton'
import { Button, ButtonRoute } from '../../ui/Button'
import { Card } from '../../ui/Card'

/** Same wording the order page's timeline uses (pickup orders have their own Ready / Collected words). */
function statusKey(order: OrderStatus): TranslationKey {
  const pickup = order.orderType === 'PICKUP' && (order.status === 'READY' || order.status === 'DELIVERED')
  return (pickup ? `st.${order.status}_PICKUP` : `st.${order.status}`) as TranslationKey
}

function TrackCard({ publicId, order }: { publicId: string; order: OrderStatus }) {
  const { t } = useT()
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-action text-on-action">
        <Icon name="truck" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-snug text-ink">{t('home.trackTitle')}</p>
        <p className="truncate text-base text-muted">
          <span dir="ltr" className="selectable font-bold tracking-wider text-ink">
            {order.publicCode}
          </span>{' '}
          · {t(statusKey(order))}
        </p>
      </div>
      <ButtonRoute to={`/order/${publicId}`} size="sm" className="shrink-0">
        {t('home.trackBtn')}
      </ButtonRoute>
    </Card>
  )
}

function OrderAgainCard({ order, lines }: { order: OrderStatus; lines: CartLine[] }) {
  const { t, lang } = useT()
  const reorderLines = useReorder()
  const names = order.lines.map((line) => pick(lang, line.name, line.nameUr) ?? line.name)
  const shown = names.slice(0, 2).join('، ')
  const rest = names.length - 2
  const reorder = () => reorderLines(lines) // replaces the cart; the live menu decides what is still sold
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-band text-ink">
        <Icon name="receipt" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-snug text-ink">{t('home.orderAgain')}</p>
        <p className="truncate text-base text-muted">
          {shown}
          {rest > 0 && (
            <>
              {' '}
              <Fill text={t('home.moreItems')} values={{ n: String(rest) }} />
            </>
          )}
        </p>
        <p dir="ltr" className="text-start font-bold text-ink">
          {formatRs(order.total)}
        </p>
      </div>
      <Button onClick={reorder} size="sm" className="shrink-0">
        <Icon name="repeat" className="size-5" />
        <span>{t('home.reorder')}</span>
      </Button>
    </Card>
  )
}

function Cards({ publicId, lines }: { publicId: string; lines: CartLine[] | undefined }) {
  const { data: order, isPending } = useOrderStatus(publicId)
  if (isPending) return <Skeleton className="h-[84px] w-full" />
  if (!order) return null // an unknown or unreachable order: show nothing rather than an error on the home screen
  return (
    <div className="space-y-3">
      {!isFinalStatus(order.status) && <TrackCard publicId={publicId} order={order} />}
      {lines && lines.length > 0 && <OrderAgainCard order={order} lines={lines} />}
    </div>
  )
}

/**
 * "Track your order" while the saved last order is still active, and "Order again" (items, total, Reorder) whenever its
 * cart lines were saved. Both come from the order saved in this browser (48 h) plus its live status.
 */
export function OrderCards() {
  // Read once per visit to the tab: placing an order changes the route, which remounts Home.
  const [last] = useState(readLastOrder)
  if (!last) return null
  return <Cards publicId={last.publicId} lines={last.lines} />
}
