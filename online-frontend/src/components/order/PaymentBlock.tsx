import { useState } from 'react'
import { apiUrl } from '../../api/client'
import type { PaymentAccount } from '../../api/store'
import { copyText } from '../../lib/clipboard'
import { phoneHref } from '../../lib/config'
import { useShopPhone } from '../../lib/useShopPhone'
import { useHistoryLayer } from '../../lib/useHistoryLayer'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Sheet } from '../Sheet'
import { Button, ButtonLink } from '../ui/Button'

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
