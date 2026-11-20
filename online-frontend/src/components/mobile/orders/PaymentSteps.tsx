import { useState, type ReactNode } from 'react'
import type { OrderStatus } from '../../../api/orders'
import type { PublicStore } from '../../../api/store'
import { formatRs } from '../../../lib/format'
import { showToast } from '../../../lib/toast'
import { useT } from '../../../i18n'
import { Fill } from '../../Fill'
import { Icon } from '../../Icon'
import { AccountCard, CallButton } from '../../order/PaymentBlock'
import { ButtonLink } from '../../ui/Button'
import { Card } from '../../ui/Card'

function Step({
  n,
  title,
  open,
  onToggle,
  children,
}: {
  n: number
  title: ReactNode
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const id = `pay-step-${n}`
  return (
    <li className="border-b border-ink/10 last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={id}
          onClick={onToggle}
          className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-start"
        >
          <span dir="ltr" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-action font-bold text-on-action">
            {n}
          </span>
          <span className="min-w-0 flex-1 text-lg font-bold leading-snug text-ink">{title}</span>
          <Icon name="arrow" className={`size-5 shrink-0 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
        </button>
      </h3>
      {open && (
        <div id={`${id}-panel`} role="region" aria-labelledby={id} className="space-y-3 px-4 pb-4">
          {children}
        </div>
      )}
    </li>
  )
}

/**
 * The payment steps for an online order that is waiting for payment, as a numbered accordion (one open at a time):
 * 1 send the money (account numbers with Copy, the QR), 2 upload the screenshot, 3 or send it on WhatsApp.
 */
export function PaymentSteps({
  order,
  store,
  whatsappHref,
  uploadSlot,
  uploading,
}: {
  order: OrderStatus
  store: PublicStore | undefined
  whatsappHref: string | null
  /** Step 2's content: the screenshot picker/progress/errors, owned by the payment card. */
  uploadSlot: ReactNode
  /** A picture is being prepared or sent: step 2 stays open so the progress is never hidden. */
  uploading: boolean
}) {
  const { t } = useT()
  const [open, setOpen] = useState(1)
  const accounts = store?.paymentAccounts ?? []
  const toggle = (n: number) => setOpen((current) => (current === n ? 0 : n))
  // While a picture is being prepared or sent, step 2 stays open (the progress is never hidden behind a closed step).
  const shown = uploading ? 2 : open

  return (
    <section aria-labelledby="pay-h" className="space-y-3">
      <h2 id="pay-h" className="text-2xl">
        {t('order.pay.title')}
      </h2>
      <Card as="ol" className="overflow-hidden">
        <Step n={1} title={<Fill text={t('pay.step.send')} values={{ amount: formatRs(order.total) }} />} open={shown === 1} onToggle={() => toggle(1)}>
          {accounts.length > 0 ? (
            <ul className="space-y-3">
              {accounts.map((account) => (
                <AccountCard key={account.id} account={account} onCopied={() => showToast({ message: t('order.pay.copied'), kind: 'success' })} />
              ))}
            </ul>
          ) : (
            <div className="space-y-2">
              <p>{t('order.pay.none')}</p>
              <CallButton />
            </div>
          )}
        </Step>
        <Step n={2} title={t('pay.step.upload')} open={shown === 2} onToggle={() => toggle(2)}>
          {uploadSlot}
        </Step>
        <Step n={3} title={t('pay.step.wa')} open={shown === 3} onToggle={() => toggle(3)}>
          {whatsappHref ? (
            <ButtonLink href={whatsappHref} target="_blank" rel="noopener noreferrer" size="lg" className="w-full !px-3 text-lg">
              <Icon name="whatsapp" className="size-7" />
              <span>{t('order.pay.wa')}</span>
            </ButtonLink>
          ) : (
            <CallButton />
          )}
        </Step>
      </Card>
      <p className="flex items-start gap-2 font-bold text-ink">
        <Icon name="clock" className="mt-2 size-6 shrink-0" />
        <span>{t('order.pay.after')}</span>
      </p>
    </section>
  )
}
