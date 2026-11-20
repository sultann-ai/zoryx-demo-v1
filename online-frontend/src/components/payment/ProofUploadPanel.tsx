import { useState, type RefObject } from 'react'
import { ApiError } from '../../api/client'
import { useT, type TranslationKey } from '../../i18n'
import { Icon } from '../Icon'
import { CallButton } from '../order/PaymentBlock'
import { Button, ButtonLink } from '../ui/Button'
import { PROOF_ACCEPT, type ProofUploader, type UploadError } from './useProofUploader'

/** The hidden input behind every "choose a screenshot" button; render it once next to the buttons. */
export function ProofFileInput({ inputRef, onPick }: { inputRef: RefObject<HTMLInputElement | null>; onPick: (file: File | undefined) => void }) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={PROOF_ACCEPT}
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        onPick(event.target.files?.[0])
        event.target.value = '' // the same picture can be chosen again after an error
      }}
    />
  )
}

/** The staff-facing note on the waiter call a stuck upload raises (not shown to the customer, so not translated). */
export const WAITER_NOTE = 'Payment proof not uploading'

/**
 * The picture could not be sent at all (too big even after shrinking, or this phone could not shrink it): never a dead
 * end. Three ways on: pick another screenshot, call the waiter (where there is a table), or send it on WhatsApp.
 */
function StuckHelp({ uploader, whatsappHref, callWaiter }: { uploader: ProofUploader; whatsappHref: string | null; callWaiter?: () => Promise<void> }) {
  const { t } = useT()
  const [waiter, setWaiter] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [waiterError, setWaiterError] = useState<string | null>(null)
  const call = async () => {
    if (!callWaiter || waiter === 'sending' || waiter === 'sent') return
    setWaiter('sending')
    setWaiterError(null)
    try {
      await callWaiter()
      setWaiter('sent')
    } catch (failure) {
      setWaiter('error')
      setWaiterError(failure instanceof ApiError ? failure.message : null)
    }
  }
  return (
    <div role="alert" data-testid="proof-stuck" className="space-y-3 rounded-card border border-error bg-surface p-4">
      <p className="flex items-start gap-2 text-lg font-bold text-error">
        <Icon name="alert" className="mt-2 size-6 shrink-0" />
        <span>{t('proof.stuck.title')}</span>
      </p>
      <p>{t('proof.stuck.body')}</p>
      <Button variant="secondary" data-testid="proof-stuck-pick" onClick={uploader.openPicker} className="w-full text-ink">
        <Icon name="image" />
        <span>{t('proof.stuck.pick')}</span>
      </Button>
      {callWaiter && (
        <>
          <Button variant="secondary" data-testid="proof-stuck-waiter" onClick={() => void call()} disabled={waiter === 'sending' || waiter === 'sent'} className="w-full text-ink">
            <Icon name={waiter === 'sent' ? 'check' : 'bell'} />
            <span>{t('proof.stuck.waiter')}</span>
          </Button>
          {waiter === 'sent' && (
            <p role="status" className="font-bold text-ink">
              {t('proof.stuck.waiterSent')}
            </p>
          )}
          {waiter === 'error' && (
            <p role="alert" className="font-bold text-error">
              {t('proof.stuck.waiterFail')}
              {waiterError && <span dir="auto" className="block text-sm font-normal text-muted">{waiterError}</span>}
            </p>
          )}
        </>
      )}
      {whatsappHref ? (
        <ButtonLink href={whatsappHref} target="_blank" rel="noopener noreferrer" data-testid="proof-stuck-whatsapp" className="w-full !px-3">
          <Icon name="whatsapp" className="size-6" />
          <span>{t('order.pay.wa')}</span>
        </ButtonLink>
      ) : (
        <CallButton />
      )}
    </div>
  )
}

function errorText(error: UploadError, online: boolean): TranslationKey {
  switch (error.kind) {
    case 'NOT_IMAGE':
      return 'proof.err.notImage'
    case 'NETWORK':
      return 'proof.err.network'
    case 'OFFLINE':
      return online ? 'proof.err.online' : 'proof.err.offline'
    case 'RATE':
      return 'proof.err.rate'
    case 'GONE':
      return 'pay.upload.gone'
    default:
      return 'proof.err.server'
  }
}

/**
 * Everything between "I have a screenshot" and "it is sent": the thumbnail, the progress bar, the buttons (disabled while
 * a send runs, so a double tap cannot send twice), Cancel, and the friendly answer to each way it can fail. The
 * chosen picture survives every failure. `chooseLabel` / `choosePrimary` let a rejection say "Upload a new screenshot".
 */
export function ProofUploadPanel({
  uploader,
  whatsappHref,
  callWaiter,
  chooseLabel,
  choosePrimary = false,
  cancellable = false,
}: {
  uploader: ProofUploader
  whatsappHref: string | null
  callWaiter?: () => Promise<void>
  chooseLabel?: string
  choosePrimary?: boolean
  /** Also offer Cancel when nothing is being sent (to drop a picture chosen to replace an earlier one). */
  cancellable?: boolean
}) {
  const { t } = useT()
  const { picked, previewUrl, busy, uploading, preparing, progress, error, online, ready } = uploader
  const [brokenPreview, setBrokenPreview] = useState<string | null>(null)
  const percent = progress === null ? null : Math.round(progress * 100)
  const stuck = error?.kind === 'UNSENDABLE'
  const retryable = !!error && error.kind !== 'NOT_IMAGE' && !stuck

  return (
    <div className="space-y-3" data-testid="proof-panel" data-busy={busy || undefined}>
      {picked && previewUrl && (
        <div className="space-y-2 rounded-card bg-canvas p-2">
          <div className="flex items-center gap-3">
            {brokenPreview === previewUrl ? (
              // A file this browser cannot draw (it may still be sendable): a plain tile instead of a broken-image icon.
              <span className="flex size-16 shrink-0 items-center justify-center rounded-inner bg-band text-muted">
                <Icon name="image" className="size-8" />
              </span>
            ) : (
              <img src={previewUrl} alt="" width={64} height={64} onError={() => setBrokenPreview(previewUrl)} className="size-16 shrink-0 rounded-inner object-cover" />
            )}
            <p dir="ltr" className="min-w-0 flex-1 truncate text-start text-base">
              {picked.name}
            </p>
          </div>
          {preparing && (
            <p role="status" className="flex items-center gap-2 px-1 text-base font-bold text-ink">
              <span aria-hidden="true" className="size-5 animate-spin rounded-full border-4 border-action/30 border-t-action" />
              {t('proof.preparing')}
            </p>
          )}
          {uploading && (
            <div className="space-y-1 px-1">
              <div
                role="progressbar"
                aria-label={t('proof.sending')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                className="h-2 overflow-hidden rounded-full bg-band"
              >
                <div
                  className={`h-full rounded-full bg-action transition-[width] duration-[var(--dur-press)] ${percent === null ? 'w-1/3 animate-pulse' : ''}`}
                  style={percent === null ? undefined : { width: `${percent}%` }}
                />
              </div>
              <p className="flex justify-between text-sm font-bold text-muted">
                <span>{t('proof.sending')}</span>
                {percent !== null && <span dir="ltr">{percent}%</span>}
              </p>
            </div>
          )}
        </div>
      )}

      {error && !stuck && (
        <p role="alert" data-testid="proof-error" className="flex items-start gap-2 font-bold text-error">
          <Icon name={error.kind === 'OFFLINE' ? 'wifi-off' : 'alert'} className="mt-2 size-5 shrink-0" />
          <span>
            {t(errorText(error, online))}
            {error.kind === 'RATE' && <span dir="auto" className="block text-sm font-normal text-muted">{error.message}</span>}
            {error.kind === 'SERVER' && error.message && <span dir="auto" className="block text-sm font-normal text-muted">{error.message}</span>}
          </span>
        </p>
      )}
      {stuck && <StuckHelp uploader={uploader} whatsappHref={whatsappHref} callWaiter={callWaiter} />}

      {retryable && picked && (
        <Button onClick={uploader.send} disabled={busy} data-testid="proof-retry" className="w-full">
          <Icon name="repeat" />
          <span>{t('err.retry')}</span>
        </Button>
      )}
      {ready && !retryable && !stuck && (
        <Button onClick={uploader.send} disabled={busy} aria-busy={uploading || undefined} data-testid="proof-send" className="w-full">
          {uploading ? (
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

      <div className="flex gap-3">
        <Button
          variant={choosePrimary && !picked ? 'primary' : 'secondary'}
          data-testid="proof-choose"
          onClick={uploader.openPicker}
          disabled={busy}
          className={`min-w-0 flex-1 ${choosePrimary && !picked ? '' : 'text-ink'}`}
        >
          <Icon name="image" />
          <span>{picked ? t('pay.upload.change') : (chooseLabel ?? t('pay.upload.choose'))}</span>
        </Button>
        {(uploading || (cancellable && picked)) && (
          <Button variant="ghost" data-testid="proof-cancel" onClick={uploading ? uploader.cancel : uploader.reset} className="shrink-0 text-ink">
            <span>{t('proof.cancel')}</span>
          </Button>
        )}
      </div>
    </div>
  )
}
