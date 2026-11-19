import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../../../api/client'
import { uploadPaymentProof, type OrderStatus } from '../../../api/orders'
import type { PublicStore } from '../../../api/store'
import { waHref } from '../../../lib/config'
import { showToast } from '../../../lib/toast'
import { formatRs } from '../../../lib/format'
import { useShopWhatsApp } from '../../../lib/useShopContact'
import { useT, type TranslationKey } from '../../../i18n'
import { Fill } from '../../Fill'
import { Icon } from '../../Icon'
import { AccountCard, CallButton } from '../../order/PaymentBlock'
import { Button, ButtonLink } from '../../ui/Button'
import { Card } from '../../ui/Card'

const MAX_BYTES = 5 * 1024 * 1024 // the server's limit
const TYPES = ['image/jpeg', 'image/png', 'image/webp']

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
 * Pick a payment screenshot and send it: an online order's (POST /payment-proof) or, at a table, the guest's share of
 * the bill. `upload` does the sending; on success the payment state moves on by itself. A 409 means the payment no
 * longer waits for a proof: the screen is refreshed through `onDone`.
 */
export function ProofUpload({ upload, onDone }: { upload: (file: File) => Promise<unknown>; onDone: () => void }) {
  const { t } = useT()
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<TranslationKey | null>(null)
  const [sending, setSending] = useState(false)

  // A temporary address for the thumbnail, released when the file changes or the step closes.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const choose = (picked: File | undefined) => {
    setError(null)
    if (!picked) return
    if (!TYPES.includes(picked.type)) return setError('pay.upload.bad')
    if (picked.size > MAX_BYTES) return setError('pay.upload.big')
    setFile(picked)
  }

  const send = async () => {
    if (!file || sending) return
    setSending(true)
    setError(null)
    try {
      await upload(file)
      onDone()
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError('pay.upload.gone')
        onDone() // the order has moved on: refresh what the screen shows
      } else if (e instanceof ApiError && e.status === 400) setError('pay.upload.bad')
      else if (e instanceof ApiError && e.status === 429) setError('err.busy')
      else {
        setError('pay.upload.fail')
        showToast({ message: t('pay.upload.fail'), kind: 'error' })
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" accept={TYPES.join(',')} className="sr-only" tabIndex={-1} onChange={(e) => choose(e.target.files?.[0])} />
      {preview && (
        <div className="flex items-center gap-3 rounded-card bg-canvas p-2">
          <img src={preview} alt="" width={64} height={64} className="size-16 shrink-0 rounded-inner object-cover" />
          <p dir="ltr" className="min-w-0 flex-1 truncate text-start text-base">
            {file?.name}
          </p>
        </div>
      )}
      <Button variant="secondary" onClick={() => input.current?.click()} className="w-full text-ink">
        <Icon name="image" />
        <span>{file ? t('pay.upload.change') : t('pay.upload.choose')}</span>
      </Button>
      {file && (
        <Button onClick={() => void send()} disabled={sending} className="w-full">
          {sending ? (
            <>
              <span aria-hidden="true" className="size-6 animate-spin rounded-full border-4 border-on-action/40 border-t-on-action" />
              <span>{t('pay.upload.sending')}</span>
            </>
          ) : (
            <>
              <Icon name="check" />
              <span>{t('pay.upload.send')}</span>
            </>
          )}
        </Button>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 font-bold text-error">
          <Icon name="alert" className="mt-2 size-5 shrink-0" />
          <span>{t(error)}</span>
        </p>
      )}
    </div>
  )
}

/**
 * The payment steps for an online order that is waiting for payment, as a numbered accordion (one open at a time):
 * 1 send the money (account numbers with Copy, the QR), 2 upload the screenshot, 3 or send it on WhatsApp.
 */
export function PaymentSteps({
  order,
  publicId,
  store,
  onUploaded,
}: {
  order: OrderStatus
  publicId: string
  store: PublicStore | undefined
  onUploaded: () => void
}) {
  const { t } = useT()
  const shopWhatsapp = useShopWhatsApp()
  const [open, setOpen] = useState(1)
  const accounts = store?.paymentAccounts ?? []
  const whatsapp = store?.settings.whatsappNumber?.trim() || shopWhatsapp
  const message = t('order.pay.waMsg').replace('{code}', order.publicCode).replace('{amount}', `Rs ${Number.parseFloat(order.total)}`)
  const toggle = (n: number) => setOpen((current) => (current === n ? 0 : n))

  return (
    <section aria-labelledby="pay-h" className="space-y-3">
      <h2 id="pay-h" className="text-2xl">
        {t('order.pay.title')}
      </h2>
      <Card as="ol" className="overflow-hidden">
        <Step n={1} title={<Fill text={t('pay.step.send')} values={{ amount: formatRs(order.total) }} />} open={open === 1} onToggle={() => toggle(1)}>
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
        <Step n={2} title={t('pay.step.upload')} open={open === 2} onToggle={() => toggle(2)}>
          <ProofUpload upload={(file) => uploadPaymentProof(publicId, file)} onDone={onUploaded} />
        </Step>
        <Step n={3} title={t('pay.step.wa')} open={open === 3} onToggle={() => toggle(3)}>
          {whatsapp ? (
            <ButtonLink href={`${waHref(whatsapp)}?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer" size="lg" className="w-full !px-3 text-lg">
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
