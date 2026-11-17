import { useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useOrderStatus } from '../api/orders'
import { useStore } from '../api/store'
import { ErrorState } from '../components/ErrorState'
import { Icon } from '../components/Icon'
import { PaymentBlock } from '../components/order/PaymentBlock'
import { StatusTimeline } from '../components/order/StatusTimeline'
import { Card } from '../components/ui/Card'
import { ButtonRoute } from '../components/ui/Button'
import { OrderTracking } from '../components/mobile/orders/OrderTracking'
import { CallLink, CashNote, NotFoundOrder, Receipt } from '../components/order/OrderParts'
import { PageSkeleton } from '../components/Skeleton'
import { pick } from '../lib/localized'
import { useIsPhone } from '../lib/useAppMode'
import { useT } from '../i18n'

export default function Order() {
  const { t, lang } = useT()
  const { publicId = '' } = useParams()
  const query = useOrderStatus(publicId)
  const store = useStore()
  const order = query.data
  // Phones get the app-style tracking screen (the same one the Orders tab shows for an active order).
  const phone = useIsPhone()
  if (phone) return <OrderTracking publicId={publicId} />

  if (query.isPending) return <PageSkeleton />
  if (!order) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundOrder />
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const cancelled = order.status === 'CANCELLED'
  const hours = store.data && pick(lang, store.data.settings.openingHoursEn, store.data.settings.openingHoursUr)
  const closedKey = store.data && !store.data.orderingOpen
    ? (store.data.closedReason ? (`home.closed.${store.data.closedReason}` as const) : 'home.closed.unknown')
    : null

  return (
    <div className="mx-auto max-w-xl space-y-8 px-4 pb-36 pt-6 max-md:pb-28">
      {cancelled ? (
        <section role="status" className="space-y-3 rounded-card bg-accent/10 p-5 text-ink">
          <h1 className="flex items-start gap-2 text-2xl !text-accent">
            <Icon name="alert" className="mt-3 size-7" />
            <span>{t('order.cancelled')}</span>
          </h1>
          {order.cancelReason && <p className="text-lg">{order.cancelReason}</p>}
          <p dir="ltr" className="text-start text-sm text-muted">
            {t('order.code')}: <span className="font-bold">{order.publicCode}</span>
          </p>
          <div className="flex flex-col gap-3">
            <CallLink className="text-ink" />
            <ButtonRoute to="/menu">
              <Icon name="cart" />
              <span>{t('order.again')}</span>
            </ButtonRoute>
          </div>
        </section>
      ) : (
        <section className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-24 items-center justify-center rounded-full bg-success text-on-action">
            <Icon name="check" className="size-16" />
          </span>
          <h1 className="text-3xl md:text-4xl">{t('order.received')}</h1>
          <p className="text-muted">{t('order.code')}</p>
          {/* The code, large, in a band-coloured chip */}
          <div dir="ltr" className="selectable rounded-full bg-band px-6 py-2 text-5xl font-bold leading-tight tracking-widest text-ink max-[359px]:px-4 max-[359px]:text-4xl">
            {order.publicCode}
          </div>
          <p className="font-bold">{t('order.keep')}</p>
        </section>
      )}

      {!cancelled && (
        <Card className="p-4">
          <StatusTimeline status={order.status} />
        </Card>
      )}

      {!cancelled && order.payment.method === 'CASH' && <CashNote order={order} />}
      {!cancelled && order.payment.method === 'ONLINE' && <PaymentBlock order={order} store={store.data} />}

      <Receipt order={order} />

      <section aria-labelledby="hrs-h" className="space-y-2">
        <h2 id="hrs-h" className="flex items-center gap-2 text-xl">
          <Icon name="clock" />
          {t('find.hours')}
        </h2>
        {hours && <p className="whitespace-pre-line">{hours}</p>}
        {closedKey && <p className="font-bold text-accent">{t(closedKey)}</p>}
      </section>

      {/* Always on screen: call, or order more */}
      <div className="fixed inset-x-0 bottom-0 z-30 bg-surface/95 p-2 shadow-soft backdrop-blur max-md:bottom-[var(--tabbar-h)]">
        <div className="mx-auto flex max-w-xl gap-2">
          <CallLink compact className="min-w-0 flex-1 !px-1 max-[339px]:text-sm" />
          <ButtonRoute to="/menu" className="min-w-0 flex-1 whitespace-nowrap !px-2">
            <Icon name="cart" />
            <span>{t('order.more')}</span>
          </ButtonRoute>
        </div>
      </div>
    </div>
  )
}
