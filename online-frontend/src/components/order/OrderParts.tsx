import { type OrderStatus } from '../../api/orders'
import { phoneHref } from '../../lib/config'
import { formatRs } from '../../lib/format'
import { pick } from '../../lib/localized'
import { useIsPhone } from '../../lib/useAppMode'
import { useShopPhone } from '../../lib/useShopPhone'
import { useT } from '../../i18n'
import { Fill } from '../Fill'
import { Icon } from '../Icon'
import { AppState } from '../mobile/AppState'
import { ButtonLink, ButtonRoute } from '../ui/Button'

/** "Call us 0300 ..." as an outline button. */
export function CallLink({ className = '', compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useT()
  const phone = useShopPhone()
  return (
    <ButtonLink href={phoneHref(phone)} variant="secondary" className={className}>
      <Icon name="phone" />
      <span className={compact ? 'hidden min-[420px]:inline' : 'whitespace-nowrap'}>{t('contact.call')}</span>
      <span dir="ltr" className="whitespace-nowrap">
        {phone}
      </span>
    </ButtonLink>
  )
}

export function NotFoundOrder() {
  const { t } = useT()
  const phone = useIsPhone()
  if (phone) {
    return (
      <AppState icon="search" title={t('order.notFound')} body={t('order.notFoundBody')}>
        <ButtonRoute to="/menu" size="lg">
          <Icon name="cart" />
          <span>{t('order.more')}</span>
        </ButtonRoute>
        <CallLink className="text-ink" />
      </AppState>
    )
  }
  return (
    <section className="mx-auto max-w-md space-y-4 px-4 py-12 text-center">
      <h1 className="text-3xl">{t('order.notFound')}</h1>
      <p>{t('order.notFoundBody')}</p>
      <div className="flex flex-col gap-3">
        <ButtonRoute to="/menu" size="lg">
          <Icon name="cart" />
          <span>{t('order.more')}</span>
        </ButtonRoute>
        <CallLink className="text-ink" />
      </div>
    </section>
  )
}

/** The lines, delivery fee and total of an order (no frame: the caller supplies the card). */
export function ReceiptList({ order, className = '' }: { order: OrderStatus; className?: string }) {
  const { t, lang } = useT()
  const fee = Number.parseFloat(order.deliveryFee)
  return (
    <ul className={`divide-y divide-ink/10 px-4 text-ink ${className}`}>
      {order.lines.map((line, index) => (
        <li key={index} className="flex items-start justify-between gap-3 py-2">
          <span>
            <span dir="ltr">{line.quantity} ×</span> {pick(lang, line.name, line.nameUr) ?? line.name}
            {line.size && <span className="text-sm text-muted"> ({line.size})</span>}
          </span>
          <span dir="ltr" className="shrink-0 font-bold">
            {formatRs(line.lineTotal)}
          </span>
        </li>
      ))}
      {fee > 0 && (
        <li className="flex justify-between py-2">
          <span>{t('checkout.deliveryFee')}</span>
          <span dir="ltr" className="font-bold">
            {formatRs(order.deliveryFee)}
          </span>
        </li>
      )}
      <li className="flex justify-between py-2 text-xl font-bold">
        <span>{t('checkout.total')}</span>
        <span dir="ltr" className="text-ink">
          {formatRs(order.total)}
        </span>
      </li>
    </ul>
  )
}

export function Receipt({ order }: { order: OrderStatus }) {
  const { t } = useT()
  return (
    <section aria-labelledby="rc-h" className="space-y-2">
      <h2 id="rc-h" className="text-xl">
        {t('cart.title')}
      </h2>
      <ReceiptList order={order} className="card" />
    </section>
  )
}

/** Cash orders: how much to hand over, and that the shop will call. */
export function CashNote({ order }: { order: OrderStatus }) {
  const { t } = useT()
  return (
    <section className="space-y-1 card p-4 text-ink">
      <p className="flex items-start gap-3 text-xl font-bold text-ink">
        <span className="flex size-tap shrink-0 items-center justify-center rounded-full bg-action text-on-action">
          <Icon name="cash" className="size-6" />
        </span>
        <span>
          <Fill text={t('order.cashPay')} values={{ amount: formatRs(order.total) }} />
        </span>
      </p>
      <p className="text-muted">{t('order.cashCall')}</p>
    </section>
  )
}
