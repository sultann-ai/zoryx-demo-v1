import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { UploadOptions } from '../../api/client'
import { vibrate } from '../../lib/haptics'
import { proofCardState, type ProofCardState, type ServerPaymentState } from '../../lib/paymentProofState'
import { showToast } from '../../lib/toast'
import { useT } from '../../i18n'
import { Fill } from '../Fill'
import { Icon } from '../Icon'
import { CallButton } from '../order/PaymentBlock'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { ProofFileInput, ProofUploadPanel } from './ProofUploadPanel'
import { useProofUploader } from './useProofUploader'

/** What the server says about one payment (an order's, and later a table share's): the card only ever shows this. */
export interface ProofPayment {
  state: ServerPaymentState
  /** When the counter got the current proof (ISO), if the server knows. */
  proofSentAt: string | null
  /** Why the payment was turned down, if staff said. */
  rejectReason: string | null
}

export interface PaymentProofCardProps {
  payment: ProofPayment
  /** The thumbnail of the proof the counter has, if any. */
  thumbUrl: string | null
  /** Sends one screenshot. Resolving means "the server took it"; the card then waits for `onUploaded` to bring the new state. */
  upload: (file: File, options: UploadOptions) => Promise<unknown>
  /** Re-read the payment from the server (after a send, or when the server says it no longer needs one). */
  onUploaded: (result?: unknown) => void
  /** The shop's WhatsApp link with the message prefilled; null falls back to calling the shop. */
  whatsappHref: string | null
  /** Table payments: call the waiter with a note. Left out where there is no table (the order status page). */
  callWaiter?: () => Promise<void>
  /** The "needs payment" content: how to pay, with `upload` placed where the screenshot goes. `busy` is true while a send runs. */
  renderSteps?: (upload: ReactNode, busy: boolean) => ReactNode
}

function useSentTime(iso: string | null): string | null {
  const { lang } = useT()
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  // Western digits in both languages (the site's rule for numbers).
  return new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK', { hour: 'numeric', minute: '2-digit' }).format(date)
}

/** Three dots that pulse one after another: "checking". Static under reduced motion (the global rule). */
function CheckingDots() {
  return (
    <span aria-hidden="true" className="flex items-center gap-1" data-testid="proof-checking">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`size-2 animate-pulse rounded-full bg-accent ${['', '[animation-delay:200ms]', '[animation-delay:400ms]'][i]}`} />
      ))}
    </span>
  )
}

/** Haptic and toast when the server moves the payment on while this page is open (not on first paint). */
function useTransitionFeedback(state: ProofCardState) {
  const { t } = useT()
  const before = useRef(state)
  useEffect(() => {
    const was = before.current
    before.current = state
    if (was === state) return
    if (state === 'VERIFIED') {
      vibrate([20, 50, 20])
      showToast({ message: t('proof.toast.verified'), kind: 'success' })
    } else if (state === 'REJECTED' && was !== 'UPLOADING') {
      vibrate([40, 60, 40])
    }
  }, [state, t])
}

/**
 * The payment of one order, as a card that always tells the truth about it. Which card shows comes from the server's
 * payment state (so it survives a reload or reopening the link); the only local thing is "a picture is going out right
 * now", and a failure never turns into "sent". States: needs payment (the steps + upload), uploading, sent and being
 * checked, verified, rejected with the counter's reason. Reusable for a table share's payment: it knows nothing about orders.
 */
export function PaymentProofCard({ payment, thumbUrl, upload, onUploaded, whatsappHref, callWaiter, renderSteps }: PaymentProofCardProps) {
  const { t } = useT()
  const uploader = useProofUploader({ upload, onUploaded })
  const layout = proofCardState(payment.state, false) // what the server says
  const shown = proofCardState(payment.state, uploader.busy)
  const sentAt = useSentTime(payment.proofSentAt)
  const [brokenThumb, setBrokenThumb] = useState<string | null>(null) // the URL that failed to load, so a new proof gets a fresh try
  useTransitionFeedback(layout)

  if (layout === 'NOT_REQUIRED') return null

  const panel = (extra?: { chooseLabel?: string; choosePrimary?: boolean; cancellable?: boolean }) => (
    <ProofUploadPanel uploader={uploader} whatsappHref={whatsappHref} callWaiter={callWaiter} {...extra} />
  )
  const hasPanelContent = uploader.picked !== null || uploader.busy || uploader.error !== null

  const announce =
    layout === 'WAITING'
      ? `${t('proof.waiting.title')}. ${t('proof.waiting.body')}`
      : layout === 'VERIFIED'
        ? `${t('proof.verified.title')}. ${t('proof.verified.body')}`
        : layout === 'REJECTED'
          ? `${t('proof.rejected.title')}. ${payment.rejectReason ?? ''}`
          : ''

  return (
    <div data-testid="payment-card" data-state={shown} data-server-state={layout}>
      {/* One polite live region for every change of state; the card itself is not re-read each time it re-renders. */}
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announce}
      </p>
      <ProofFileInput inputRef={uploader.inputRef} onPick={uploader.pick} />
      <div key={layout} className="proof-swap">
        {layout === 'NEEDS_PAYMENT' && (renderSteps ? renderSteps(panel(), uploader.busy) : <Card className="p-4">{panel()}</Card>)}

        {layout === 'WAITING' && (
          <Card className="space-y-4 p-4" aria-labelledby="proof-h">
            <div className="flex items-start gap-3">
              <span className="flex size-tap shrink-0 items-center justify-center rounded-full bg-success text-on-action">
                <Icon name="check" className="size-6" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <h2 id="proof-h" className="text-2xl leading-tight">
                  {t('proof.waiting.title')}
                </h2>
                <p>{t('proof.waiting.body')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-card bg-canvas p-3">
              {thumbUrl && brokenThumb !== thumbUrl && (
                <img
                  src={thumbUrl}
                  alt={t('proof.thumb.alt')}
                  width={64}
                  height={64}
                  data-testid="proof-thumb"
                  onError={() => setBrokenThumb(thumbUrl)}
                  className="size-16 shrink-0 rounded-inner border border-ink/10 bg-surface object-cover"
                />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                {sentAt && (
                  <p className="font-bold text-ink">
                    <Fill text={t('proof.sentAt')} values={{ time: sentAt }} />
                  </p>
                )}
                <p className="flex items-center gap-2 text-base text-muted">
                  <CheckingDots />
                  <span>{t('proof.checking')}</span>
                </p>
              </div>
            </div>
            {hasPanelContent ? (
              panel({ cancellable: true })
            ) : (
              <Button variant="ghost" size="sm" data-testid="proof-replace" onClick={uploader.openPicker} className="text-ink">
                <Icon name="repeat" />
                <span>{t('proof.replace')}</span>
              </Button>
            )}
          </Card>
        )}

        {layout === 'VERIFIED' && (
          <div className="flex items-start gap-3 rounded-card bg-success p-4 text-on-action">
            <Icon name="check" className="size-9 shrink-0" />
            <div className="space-y-1">
              <h2 className="text-2xl leading-tight !text-on-action">{t('proof.verified.title')}</h2>
              <p>{t('proof.verified.body')}</p>
            </div>
          </div>
        )}

        {layout === 'REJECTED' && (
          <Card className="space-y-4 border border-error p-4" aria-labelledby="proof-h">
            <h2 id="proof-h" className="flex items-start gap-2 text-2xl leading-tight !text-error">
              <Icon name="alert" className="mt-2 size-7 shrink-0" />
              <span>{t('proof.rejected.title')}</span>
            </h2>
            <div className="space-y-1 rounded-card bg-canvas p-3" data-testid="proof-reject-reason">
              {payment.rejectReason ? (
                <>
                  <p className="text-sm font-bold text-muted">{t('proof.rejected.reason')}</p>
                  <p dir="auto" className="text-xl font-bold text-ink">
                    {payment.rejectReason}
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold text-ink">{t('proof.rejected.generic')}</p>
              )}
            </div>
            {panel({ chooseLabel: t('proof.rejected.cta'), choosePrimary: true, cancellable: true })}
            <CallButton />
          </Card>
        )}
      </div>
    </div>
  )
}
