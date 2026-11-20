import { useEffect, useState } from 'react'
import { ApiError } from '../../../api/client'
import { useOrderStatus } from '../../../api/orders'
import { useStore } from '../../../api/store'
import { copyText } from '../../../lib/clipboard'
import { phoneHref } from '../../../lib/config'
import { formatRs } from '../../../lib/format'
import { statusLabel } from '../../../lib/orderStatus'
import { showToast } from '../../../lib/toast'
import { usePullToRefresh } from '../../../lib/usePullToRefresh'
import { useShopPhone } from '../../../lib/useShopPhone'
import { useT } from '../../../i18n'
import { ErrorState } from '../../ErrorState'
import { Icon } from '../../Icon'
import { CashNote, NotFoundOrder, ReceiptList } from '../../order/OrderParts'
import { OrderPayment } from '../../order/OrderPayment'
import { PageSkeleton } from '../../Skeleton'
import { ButtonLink } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { StepProgress } from './StepProgress'

/** The spinner that follows the finger while pulling, and spins while the refresh runs. */
function PullIndicator({ pull, refreshing }: { pull: number; refreshing: boolean }) {
  const { t } = useT()
  if (pull <= 0 && !refreshing) return null
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-[var(--header-h)] z-20 flex justify-center"
      style={{ transform: `translateY(${Math.min(pull, 60) - 8}px)` }}
    >
      <span className="flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-base font-bold text-ink shadow-soft">
        <span
          aria-hidden="true"
          className={`size-6 rounded-full border-4 border-action/30 border-t-action ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${pull * 5}deg)` }}
        />
        <span>{refreshing ? t('track.refreshing') : t('track.pull')}</span>
      </span>
    </div>
  )
}

/** The order code as a large chip: tap to copy it. */
function CodeChip({ code }: { code: string }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () =>
    void copyText(code).then((ok) => {
      setCopied(ok)
      showToast(ok ? { message: t('track.copied'), kind: 'success' } : { message: t('toast.copyFailed'), kind: 'error' })
    })
  return (
    <div className="flex flex-col items-center gap-1">
      <p className="text-muted">{t('order.code')}</p>
      <button
        type="button"
        onClick={copy}
        aria-label={`${t('track.copyCode')}: ${code}`}
        className="flex items-center gap-3 rounded-full bg-band px-6 py-1 text-ink transition-transform motion-safe:active:scale-95"
      >
        <span dir="ltr" className="selectable text-5xl font-bold leading-tight tracking-widest max-[359px]:text-4xl">
          {code}
        </span>
        <Icon name={copied ? 'check' : 'copy'} className="size-7" />
      </button>
      <p className="min-h-7 text-base font-bold text-muted">{t('track.copyCode')}</p>
    </div>
  )
}

/**
 * The phone tracking screen for one order: a large status headline, an animated step progress, the code as a copyable
 * chip, the payment steps while payment is pending, the items as a collapsible card and a sticky Call button.
 * Polls every 20 s (useOrderStatus) and refreshes on a pull-down.
 */
export function OrderTracking({ publicId }: { publicId: string }) {
  const { t } = useT()
  const query = useOrderStatus(publicId)
  const store = useStore()
  const phone = useShopPhone()
  const { pull, refreshing } = usePullToRefresh(() =>
    query.refetch().then((result) => {
      if (result.isError) showToast({ message: t('err.network'), kind: 'error' })
    }),
  )
  const order = query.data

  if (query.isPending) return <PageSkeleton />
  if (!order) {
    if (query.error instanceof ApiError && query.error.status === 404) return <NotFoundOrder />
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }

  const cancelled = order.status === 'CANCELLED'
  const count = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const online = order.payment.method === 'ONLINE'

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 pb-44 pt-2">
      <PullIndicator pull={pull} refreshing={refreshing} />

      {cancelled ? (
        <section role="status" className="space-y-2 rounded-card bg-accent/10 p-5 text-ink">
          <h1 className="flex items-start gap-2 text-3xl !text-accent">
            <Icon name="alert" className="mt-3 size-8 shrink-0" />
            <span>{t('order.cancelled')}</span>
          </h1>
          {order.cancelReason && <p className="text-lg">{order.cancelReason}</p>}
        </section>
      ) : (
        <h1 className="text-4xl leading-tight" aria-live="polite">
          {t(statusLabel(order.status, order.orderType))}
        </h1>
      )}

      <CodeChip code={order.publicCode} />

      {!cancelled && (
        <Card className="p-4">
          <StepProgress status={order.status} orderType={order.orderType} />
        </Card>
      )}

      {!cancelled && !online && <CashNote order={order} />}
      {!cancelled && online && <OrderPayment order={order} publicId={publicId} store={store.data} />}

      <Card as="details" className="group">
        <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-4 py-2 text-lg font-bold text-ink">
          <span>
            {t('track.items')} <span className="font-normal text-muted">(<span dir="ltr">{count}</span>)</span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span dir="ltr">{formatRs(order.total)}</span>
            <Icon name="arrow" className="size-5 rotate-90 transition-transform group-open:-rotate-90" />
          </span>
        </summary>
        <ReceiptList order={order} />
      </Card>

      {/* Always in reach: call the shop. Sits just above the tab bar. */}
      <div className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-20 bg-surface/95 p-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] shadow-soft backdrop-blur">
        <div className="mx-auto max-w-xl">
          <ButtonLink href={phoneHref(phone)} size="lg" className="w-full">
            <Icon name="phone" />
            <span className="whitespace-nowrap">{t('contact.call')}</span>
            <span dir="ltr" className="whitespace-nowrap">
              {phone}
            </span>
          </ButtonLink>
        </div>
      </div>
    </div>
  )
}
