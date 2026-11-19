import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { sendTableOrder, type TableOrderResult } from '../../api/table'
import { useCart } from '../../cart/context'
import { useResolvedCart } from '../../cart/pricing'
import { Fill } from '../../components/Fill'
import { Icon } from '../../components/Icon'
import { CartSheet } from '../../components/menu/CartSheet'
import { Steps } from '../../components/mobile/orders/StepProgress'
import { Sheet } from '../../components/Sheet'
import { Button } from '../../components/ui/Button'
import { setCartPanel, useCartPanel } from '../../lib/cartPanel'
import { formatRs } from '../../lib/format'
import { vibrate } from '../../lib/haptics'
import { queryClient } from '../../lib/queryClient'
import { formatWait, useCountdown } from '../../lib/useCountdown'
import { useHistoryLayer } from '../../lib/useHistoryLayer'
import { useIsPhone } from '../../lib/useAppMode'
import { useT } from '../../i18n'
import { endsSession, isBillLocked, tablePath, useTable } from './TableContext'
import { ROUND_LABEL, ROUND_STEPS, roundStep } from './roundStatus'
import { isClosedRefusal, retryAfter, tableErrorText } from './tableErrors'

/**
 * "Order sent": a clear confirmation, then the round's live status from the poll (Awaiting reception -> Preparing ->
 * Ready -> Served) on the same sheet, so the guest sees it move without going anywhere.
 */
function SentSheet({ sent, onClose }: { sent: TableOrderResult; onClose: () => void }) {
  const { t } = useT()
  const table = useTable()
  const navigate = useNavigate()
  const phone = useIsPhone()
  const index = table.poll.rounds.findIndex((r) => r.orderId === sent.orderId)
  const round = index >= 0 ? table.poll.rounds[index] : null
  const status = round?.status ?? 'RECEIVED'

  // Replace the sheet's history entry with the page (closing first would run a Back that undoes the navigation).
  const go = (page: '' | 'menu') => {
    navigate(tablePath(table.qrKey, page), { replace: true })
    onClose()
  }

  return (
    <Sheet
      title={t('table.sent.title')}
      onClose={onClose}
      draggable={phone}
      tall={phone}
      footer={
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" className="text-ink" onClick={() => go('menu')}>
            {t('table.sent.more')}
          </Button>
          <Button onClick={() => go('')}>{t('table.sent.home')}</Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        <div role="status" className="flex flex-col items-center gap-2 text-center">
          <span className="pop flex size-20 items-center justify-center rounded-full bg-success text-on-action">
            <Icon name="check" className="size-12" />
          </span>
          <p className="text-2xl font-bold text-ink">
            <Fill text={t('table.round.n')} values={{ n: String(index >= 0 ? index + 1 : table.poll.rounds.length + 1) }} />
            {' · '}
            <span dir="ltr" className="num">
              {formatRs(sent.total)}
            </span>
          </p>
          <p className="text-lg text-muted">{t('table.sent.body')}</p>
        </div>
        {status === 'CANCELLED' ? (
          <p role="alert" className="flex items-start gap-2 rounded-inner bg-band p-3 font-bold text-error">
            <Icon name="close" className="mt-1 size-5 shrink-0" />
            <span>
              {t(ROUND_LABEL.CANCELLED)}
              {round?.cancelReason ? ` — ${round.cancelReason}` : ''}
            </span>
          </p>
        ) : (
          <div aria-live="polite">
            <Steps
              steps={ROUND_STEPS.map((s) => ({ key: s.key, icon: s.icon, label: t(s.key === 'PREPARING' && status === 'SENT_TO_KITCHEN' ? ROUND_LABEL.SENT_TO_KITCHEN : s.label) }))}
              current={roundStep(status)}
              finished={status === 'SERVED'}
            />
          </div>
        )}
      </div>
    </Sheet>
  )
}

/**
 * The joined guest's cart: the website's CartSheet in its table mode, opened by the Cart tab or the mini-cart pill.
 * "Send order" posts the round with this cart's one clientRequestId (resent unchanged on a retry, so a dropped answer
 * can never make two rounds), then clears the cart and shows the confirmation. Cooldowns count down in the sheet.
 */
export function TableCart() {
  const { t } = useT()
  const table = useTable()
  const cart = useCart()
  const { lines } = useResolvedCart()
  const phase = useCartPanel()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localUntil, setLocalUntil] = useState(0)
  const [sent, setSent] = useState<TableOrderResult | null>(null)
  const wait = useCountdown(Math.max(table.poll.receivedAt + table.poll.cooldowns.orderSeconds * 1000, localUntil))
  const open = phase !== 'closed'
  const closed = !table.poll.session.orderingOpen || isBillLocked(table.poll)

  useHistoryLayer(open || sent !== null, () => {
    setCartPanel('closed')
    setSent(null)
  })

  const send = async () => {
    if (busy || lines.length === 0) return
    setBusy(true)
    setError(null)
    try {
      const result = await sendTableOrder(table.token, {
        clientRequestId: cart.ensureRequestId(),
        items: lines
          .filter((l) => l.line.kind === 'item')
          .map((l) => ({
            menuItemId: l.line.id,
            quantity: l.line.qty,
            ...(l.line.variantId ? { variantId: l.line.variantId } : {}),
            ...(l.line.addOnIds.length > 0 ? { addOnIds: l.line.addOnIds } : {}),
            ...(l.line.notes ? { notes: l.line.notes } : {}),
          })),
        deals: lines.filter((l) => l.line.kind === 'deal').map((l) => ({ dealId: l.line.id, quantity: l.line.qty })),
      })
      vibrate([15, 40, 25])
      cart.clear()
      // Swap the cart for the confirmation without giving up the history entry (one Back closes it).
      setSent(result)
      setCartPanel('closed')
      table.refresh()
    } catch (err) {
      if (endsSession(err, table)) return
      const seconds = retryAfter(err)
      if (seconds > 0) setLocalUntil(Date.now() + seconds * 1000)
      if (err instanceof ApiError && err.code === 'REQUEST_ID_REUSED') cart.resetRequestId()
      // Something left the menu: reload it, and the cart drops what can't be ordered any more.
      if (err instanceof ApiError && err.code === 'ITEM_UNAVAILABLE') void queryClient.invalidateQueries({ queryKey: ['table-menu'] })
      if (isClosedRefusal(err)) table.refresh()
      setError(seconds > 0 ? null : tableErrorText(err, t))
    } finally {
      setBusy(false)
    }
  }

  const message =
    wait > 0 ? (
      <p role="status" className="flex items-center gap-2 font-bold text-ink">
        <Icon name="clock" className="size-5 shrink-0" />
        <Fill text={t('table.cart.wait')} values={{ time: formatWait(wait) }} />
      </p>
    ) : error ? (
      <p role="alert" className="flex items-start gap-2 font-bold text-error">
        <Icon name="alert" className="mt-1 size-5 shrink-0" />
        <span>{error}</span>
      </p>
    ) : null

  return (
    <>
      {open && (
        <CartSheet
          closed={closed}
          onClose={() => {
            setCartPanel('closed')
            setError(null)
          }}
          onContinue={() => void send()}
          table={{ note: t('table.cart.note'), sendLabel: t('table.cart.send'), busy, blocked: wait > 0, message }}
        />
      )}
      {sent && <SentSheet sent={sent} onClose={() => setSent(null)} />}
    </>
  )
}
