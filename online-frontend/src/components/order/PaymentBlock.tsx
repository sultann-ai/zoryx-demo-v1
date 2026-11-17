import { useEffect, useState } from 'react'
import { apiUrl } from '../../api/client'
import type { OrderStatus } from '../../api/orders'
import type { PaymentAccount, PublicStore } from '../../api/store'
import { copyText } from '../../lib/clipboard'
import { phoneHref, waHref } from '../../lib/config'
import { formatRs } from '../../lib/format'
import { useShopWhatsApp } from '../../lib/useShopContact'
import { useShopPhone } from '../../lib/useShopPhone'
import { useHistoryLayer } from '../../lib/useHistoryLayer'
import { useT } from '../../i18n'
import { Fill } from '../Fill'
import { Icon } from '../Icon'
import { Sheet } from '../Sheet'
import { Button, ButtonLink } from '../ui/Button'
import { Card } from '../ui/Card'

export function CallButton() {
  const { t } = useT()
  const phone = useShopPhone()
  return (
    <ButtonLink href={phoneHref(phone)} className="w-full !px-3">
      <Icon name="phone" />
      <span className="whitespace-nowrap">{t('contact.call')}</span>
      <span dir="ltr" className="whitespace-nowrap">
        {phone}
      </span>
    </ButtonLink>
  )
}

export function AccountCard({ account, onCopied }: { account: PaymentAccount; onCopied: () => void }) {
  const { t } = useT()
  const [qrOpen, setQrOpen] = useState(false)
  useHistoryLayer(qrOpen, () => setQrOpen(false))
  return (
    <li className="space-y-3 rounded-card bg-canvas p-4 text-ink">
      <p className="flex items-center gap-3 text-xl font-bold text-ink">
        <span className="flex size-tap shrink-0 items-center justify-center rounded-full bg-action text-on-action">
          <Icon name="cash" className="size-6" />
        </span>
        <span>{account.label}</span>
      </p>
      <p>
        <span className="text-sm text-muted">{t('order.pay.accountName')}: </span>
        <span className="font-bold">{account.accountTitle}</span>
      </p>
      <div dir="ltr" className="selectable select-all text-start text-3xl font-bold tracking-wide text-ink [overflow-wrap:anywhere] max-[339px]:text-2xl">
        {account.accountNumber}
      </div>
      <Button onClick={() => void copyText(account.accountNumber).then((ok) => ok && onCopied())} className="whitespace-nowrap">
        <span>{t('order.pay.copy')}</span>
      </Button>
      {account.qrUrl && (
        <div className="space-y-2">
          <button type="button" onClick={() => setQrOpen(true)} aria-label={t('order.pay.qrOpen')} className="block rounded-card bg-surface p-2 shadow-soft">
            <img src={apiUrl(account.qrUrl)} alt={account.label} width={160} height={160} loading="lazy" className="size-40 object-contain" />
          </button>
          <p className="text-sm text-muted">{t('order.pay.qrNote')}</p>
          {qrOpen && (
            <Sheet title={account.label} onClose={() => setQrOpen(false)}>
              <img src={apiUrl(account.qrUrl)} alt={account.label} width={384} height={384} className="mx-auto max-h-[70svh] w-full max-w-sm object-contain" />
              <p className="mt-3 text-center text-sm">{t('order.pay.qrNote')}</p>
            </Sheet>
          )}
        </div>
      )}
    </li>
  )
}

/** Everything about paying for an ONLINE order, driven by the payment state the server derives. */
export function PaymentBlock({ order, store }: { order: OrderStatus; store: PublicStore | undefined }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const shopWhatsapp = useShopWhatsApp()
  const { state } = order.payment

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  if (state === 'PAYMENT_CONFIRMED') {
    return (
      <div role="status" className="flex items-center gap-3 rounded-card bg-success p-4 text-xl font-bold text-on-action">
        <Icon name="check" className="size-8" />
        <span>{t('order.pay.done')}</span>
      </div>
    )
  }
  if (state === 'PAYMENT_PROBLEM') {
    return (
      <div role="alert" className="space-y-3 rounded-card border border-error bg-surface p-4">
        <p className="flex items-start gap-2 font-bold text-error">
          <Icon name="alert" className="mt-2 size-6" />
          <span>{t('order.pay.problem')}</span>
        </p>
        <CallButton />
      </div>
    )
  }
  if (state === 'PROOF_RECEIVED') {
    return (
      <p role="status" className="flex items-start gap-3 card p-4">
        <Icon name="clock" className="mt-2 size-6 text-accent" />
        <span>{t('order.pay.checking')}</span>
      </p>
    )
  }
  if (state !== 'WAITING_FOR_PAYMENT') return null

  const amount = formatRs(order.total)
  const accounts = store?.paymentAccounts ?? []
  const whatsapp = store?.settings.whatsappNumber?.trim() || shopWhatsapp
  const message = t('order.pay.waMsg')
    .replace('{code}', order.publicCode)
    .replace('{amount}', `Rs ${Number.parseFloat(order.total)}`)

  return (
    <section aria-labelledby="pay-h" className="space-y-4">
      <h2 id="pay-h" className="text-2xl">
        {t('order.pay.title')}
      </h2>

      <Card className="space-y-3 p-4">
        <p className="flex items-start gap-3 text-xl font-bold text-ink">
          <span dir="ltr" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-action text-on-action">
            1
          </span>
          <span>
            <Fill text={t('order.pay.step1')} values={{ amount }} />
          </span>
        </p>
        {accounts.length > 0 ? (
          <ul className="space-y-3">
            {accounts.map((account) => (
              <AccountCard key={account.id} account={account} onCopied={() => setCopied(true)} />
            ))}
          </ul>
        ) : (
          <div className="space-y-2">
            <p>{t('order.pay.none')}</p>
            <CallButton />
          </div>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <p className="flex items-start gap-3 text-xl font-bold text-ink">
          <span dir="ltr" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-action text-on-action">
            2
          </span>
          <span>{t('order.pay.step2')}</span>
        </p>
        {whatsapp ? (
          <ButtonLink
            href={`${waHref(whatsapp)}?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noopener noreferrer"
            size="lg"
            className="w-full !px-3 text-lg"
          >
            <Icon name="whatsapp" className="size-7" />
            <span>{t('order.pay.wa')}</span>
          </ButtonLink>
        ) : (
          <CallButton />
        )}
      </Card>

      <p className="flex items-start gap-2 font-bold text-ink">
        <Icon name="clock" className="mt-2 size-6 shrink-0" />
        <span>{t('order.pay.after')}</span>
      </p>

      {copied && (
        <p role="status" className="fixed inset-x-4 bottom-28 z-40 max-md:bottom-[calc(var(--tabbar-h)+4.5rem)] mx-auto flex max-w-xs items-center justify-center gap-2 rounded-full bg-ink px-5 py-2 font-bold text-on-action shadow-soft">
          <Icon name="check" />
          {t('order.pay.copied')}
        </p>
      )}
    </section>
  )
}
