import { useEffect, useState } from 'react'
import { cancelRound, type Round } from '../../api/table'
import { Fill } from '../../components/Fill'
import { Icon } from '../../components/Icon'
import { Card } from '../../components/ui/Card'
import { formatRs } from '../../lib/format'
import { pick } from '../../lib/localized'
import { showToast } from '../../lib/toast'
import { useT } from '../../i18n'
import { endsSession, useTable } from './TableContext'
import { formatTime, ROUND_LABEL, ROUND_STEPS, roundStep } from './roundStatus'
import { tableErrorText } from './tableErrors'

/** A round's line in words: "2 × Zinger burger (Large) + Cheese". */
export function LineText({ line }: { line: Round['lines'][number] }) {
  const { lang } = useT()
  return (
    <>
      <span dir="ltr" className="num">
        {line.quantity} ×
      </span>{' '}
      <span className="font-bold">{pick(lang, line.name, line.nameUr) ?? line.name}</span>
      {line.size && <span className="text-muted"> ({line.size})</span>}
      {line.addOns.length > 0 && <span className="text-muted"> + {line.addOns.map((a) => a.name).join('، ')}</span>}
    </>
  )
}

/**
 * Where a round is, as a compact track of the four steps (Awaiting reception -> Preparing -> Ready -> Served): done
 * segments filled, the current one in sunflower. The words above it carry the meaning; the track is decoration.
 */
function Track({ round }: { round: Round }) {
  if (round.status === 'CANCELLED') return null
  const current = roundStep(round.status)
  const finished = round.status === 'SERVED'
  return (
    <ol aria-hidden="true" className="grid grid-cols-4 gap-1.5">
      {ROUND_STEPS.map((step, i) => (
        <li
          key={step.key}
          className={`h-2 rounded-full transition-colors duration-[var(--dur-page)] ${
            i < current || finished ? 'bg-success' : i === current ? 'bg-sunflower' : 'bg-ink/10'
          }`}
        />
      ))}
    </ol>
  )
}

/** One round of the table: who sent it, when, its status track, its lines (folded) and, for my own waiting round, Cancel. */
export function RoundCard({ round, number, open = false }: { round: Round; number: number; open?: boolean }) {
  const { t, lang } = useT()
  const table = useTable()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const cancelled = round.status === 'CANCELLED'

  // "Tap again to cancel" goes back to plain "Cancel" after a few seconds.
  useEffect(() => {
    if (!confirming) return
    const timer = window.setTimeout(() => setConfirming(false), 4000)
    return () => window.clearTimeout(timer)
  }, [confirming])

  const cancel = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setBusy(true)
    try {
      await cancelRound(table.token, round.orderId)
      showToast({ message: t('table.round.cancelled'), kind: 'success' })
    } catch (error) {
      if (!endsSession(error, table)) showToast({ message: tableErrorText(error, t), kind: 'error' })
    } finally {
      setBusy(false)
      setConfirming(false)
      table.refresh()
    }
  }

  return (
    <Card as="li" className={`space-y-3 p-4 ${cancelled ? 'opacity-80' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-ink">
            <Fill text={t('table.round.n')} values={{ n: String(number) }} />
            <span className="font-normal text-muted">
              {' · '}
              {round.isMine ? t('table.you') : (round.guestName ?? t('table.shared'))}
              {' · '}
              <span dir="ltr">{formatTime(lang, round.createdAt)}</span>
            </span>
          </p>
          <p className={`flex items-center gap-1.5 text-lg font-bold ${cancelled ? 'text-error' : round.status === 'READY' ? 'text-accent' : 'text-ink'}`}>
            {cancelled && <Icon name="close" className="size-5" />}
            {round.status === 'SERVED' && <Icon name="check" className="size-5 text-success" />}
            {round.status === 'READY' && <Icon name="bell" className="size-5" />}
            {t(ROUND_LABEL[round.status])}
          </p>
        </div>
        <span dir="ltr" className="num shrink-0 text-lg text-ink">
          {formatRs(round.total)}
        </span>
      </div>
      <Track round={round} />
      {round.status === 'RECEIVED' && <p className="text-base text-muted">{t('table.round.waitingHint')}</p>}
      {cancelled && round.cancelReason && (
        <p className="text-base text-muted">
          {t('table.round.reason')}: {round.cancelReason}
        </p>
      )}

      <details open={open} className="group">
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 font-bold text-accent">
          <Icon name="arrow" className="size-5 transition-transform duration-[var(--dur-press)] group-open:rotate-90" mirror />
          <Fill text={t(round.lines.length === 1 ? 'table.round.linesOne' : 'table.round.lines')} values={{ n: String(round.lines.length) }} />
        </summary>
        <ul className="space-y-2 pt-1">
          {round.lines.map((line) => (
            <li key={line.lineId} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words">
                  <LineText line={line} />
                </p>
                {line.note && (
                  <p className="flex items-start gap-1 text-sm text-muted">
                    <Icon name="note" className="mt-1 size-4 shrink-0" />
                    <span className="min-w-0 break-words">{line.note}</span>
                  </p>
                )}
              </div>
              <span dir="ltr" className="num shrink-0 text-ink">
                {formatRs(line.lineTotal)}
              </span>
            </li>
          ))}
        </ul>
      </details>

      {round.isMine && round.status === 'RECEIVED' && (
        <button
          type="button"
          onClick={() => void cancel()}
          disabled={busy}
          aria-live="polite"
          className={`flex min-h-touch w-full items-center justify-center gap-2 rounded-full border font-bold disabled:opacity-40 ${
            confirming ? 'border-error bg-error text-on-action' : 'border-ink/20 text-ink'
          }`}
        >
          <Icon name="close" className="size-5" />
          {busy ? t('checkout.sending') : confirming ? t('table.round.confirmCancel') : t('table.round.cancel')}
        </button>
      )}
    </Card>
  )
}
