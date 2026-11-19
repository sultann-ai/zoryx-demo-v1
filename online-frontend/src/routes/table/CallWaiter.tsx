import { useId, useRef, useState } from 'react'
import { ApiError } from '../../api/client'
import { cancelCall, raiseCall, type CallStatus, type CallType, type MyCall } from '../../api/table'
import { inputClass } from '../../components/checkout/Field'
import { Fill } from '../../components/Fill'
import { Icon, type IconName } from '../../components/Icon'
import { Sheet } from '../../components/Sheet'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { vibrate } from '../../lib/haptics'
import { showToast } from '../../lib/toast'
import { formatWait, useCountdown } from '../../lib/useCountdown'
import { useHistoryLayer } from '../../lib/useHistoryLayer'
import { useIsPhone } from '../../lib/useAppMode'
import { uuid } from '../../lib/uuid'
import { useT, type TranslationKey } from '../../i18n'
import { endsSession, useTable } from './TableContext'
import { formatTime } from './roundStatus'
import { isClosedRefusal, retryAfter, tableErrorText } from './tableErrors'

/** The server's limit on an "Other" note (CALL_NOTE_MAX_LENGTH). */
const MAX_CALL_NOTE = 80

const OPTIONS: { type: CallType; icon: IconName; label: TranslationKey }[] = [
  { type: 'WATER', icon: 'drop', label: 'table.call.WATER' },
  { type: 'NAPKINS', icon: 'napkin', label: 'table.call.NAPKINS' },
  { type: 'BILL_CASH', icon: 'cash', label: 'table.call.BILL_CASH' },
  { type: 'OTHER', icon: 'note', label: 'table.call.OTHER' },
]

const CALL_LABEL: Record<CallType, TranslationKey> = {
  WATER: 'table.call.WATER',
  NAPKINS: 'table.call.NAPKINS',
  BILL_CASH: 'table.call.BILL_CASH',
  OTHER: 'table.call.OTHER',
}

const STATUS_LABEL: Record<CallStatus, TranslationKey> = {
  RAISED: 'table.callSt.RAISED',
  ACKNOWLEDGED: 'table.callSt.ACKNOWLEDGED',
  RESOLVED: 'table.callSt.RESOLVED',
  CANCELLED: 'table.callSt.CANCELLED',
}

const isOpenCall = (call: MyCall) => call.status === 'RAISED' || call.status === 'ACKNOWLEDGED'

/**
 * Seconds left before this guest may call again: the poll's cooldown counted from when that answer arrived, or a
 * server 429 COOLDOWN's retryAfterSeconds, whichever ends later.
 */
function useCallWait(local: number): number {
  const { poll } = useTable()
  return useCountdown(Math.max(poll.receivedAt + poll.cooldowns.callSeconds * 1000, local))
}

/** The options: four large tiles; "Other" opens an 80-character note first. Each tile sends at once. */
function CallSheet({ onClose, wait, onCooldown }: { onClose: () => void; wait: number; onCooldown: (until: number) => void }) {
  const { t } = useT()
  const table = useTable()
  const phone = useIsPhone()
  const noteId = useId()
  const [other, setOther] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<CallType | null>(null)
  const [error, setError] = useState<string | null>(null)
  // One request id per kind of call while this sheet is open: a retry after a dropped answer can't call twice.
  const ids = useRef(new Map<CallType, string>())

  const send = async (type: CallType) => {
    const cleaned = note.trim().replace(/\s+/g, ' ')
    if (type === 'OTHER' && !cleaned) {
      setError(t('table.call.noteNeeded'))
      return
    }
    const clientRequestId = ids.current.get(type) ?? uuid()
    ids.current.set(type, clientRequestId)
    setBusy(type)
    setError(null)
    try {
      await raiseCall(table.token, { clientRequestId, type, ...(type === 'OTHER' ? { note: cleaned } : {}) })
      vibrate([15, 40, 25])
      showToast({ message: t('table.call.sent'), kind: 'success' })
      table.refresh()
      onClose()
    } catch (err) {
      if (endsSession(err, table)) return
      const seconds = retryAfter(err)
      if (seconds > 0) onCooldown(Date.now() + seconds * 1000)
      // A definite refusal: the next try is a new call. A network failure keeps the id (it may have got through).
      if (!(err instanceof ApiError && err.status === 0)) ids.current.delete(type)
      if (isClosedRefusal(err)) table.refresh()
      setError(seconds > 0 ? null : tableErrorText(err, t))
    } finally {
      setBusy(null)
    }
  }

  const cooling = wait > 0
  return (
    <Sheet title={t('table.call.title')} onClose={onClose} draggable={phone}>
      <div className="space-y-4 pb-2">
        {cooling && (
          <p role="status" className="flex items-center gap-2 rounded-inner bg-band p-3 font-bold text-ink">
            <Icon name="clock" className="size-5 shrink-0" />
            <Fill text={t('table.call.again')} values={{ time: formatWait(wait) }} />
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          {OPTIONS.map((option) => {
            const selected = option.type === 'OTHER' && other
            return (
              <button
                key={option.type}
                type="button"
                disabled={cooling || busy !== null}
                aria-pressed={option.type === 'OTHER' ? other : undefined}
                onClick={() => (option.type === 'OTHER' ? setOther((v) => !v) : void send(option.type))}
                className={`flex min-h-28 flex-col items-center justify-center gap-2 rounded-card p-3 text-center text-lg font-bold shadow-soft transition-colors disabled:opacity-40 ${
                  selected ? 'bg-action text-on-action' : 'bg-surface text-ink'
                }`}
              >
                <Icon name={option.icon} className="size-9" />
                <span>{busy === option.type ? t('checkout.sending') : t(option.label)}</span>
              </button>
            )
          })}
        </div>
        {other && (
          <div className="space-y-2">
            <label htmlFor={noteId} className="block font-bold text-ink">
              {t('table.call.noteLabel')}
            </label>
            <textarea
              id={noteId}
              rows={2}
              autoFocus
              maxLength={MAX_CALL_NOTE}
              enterKeyHint="send"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('table.call.notePlaceholder')}
              className={`${inputClass} border-muted py-3`}
            />
            <Button size="lg" className="w-full" disabled={cooling || busy !== null} onClick={() => void send('OTHER')}>
              <Icon name="bell" />
              <span>{busy === 'OTHER' ? t('checkout.sending') : t('table.call.send')}</span>
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className="flex items-start gap-2 font-bold text-error">
            <Icon name="alert" className="mt-1 size-5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </Sheet>
  )
}

/** My calls still open (and the last finished one), newest first, each with its status and a way to take it back. */
function MyCalls() {
  const { t, lang } = useT()
  const table = useTable()
  const [busy, setBusy] = useState<string | null>(null)
  const open = table.poll.myCalls.filter(isOpenCall)
  const lastDone = table.poll.myCalls.find((c) => !isOpenCall(c))
  const shown = lastDone && open.length < 3 ? [...open, lastDone] : open
  if (shown.length === 0) return null

  const withdraw = async (id: string) => {
    setBusy(id)
    try {
      await cancelCall(table.token, id)
    } catch (error) {
      if (!endsSession(error, table)) showToast({ message: tableErrorText(error, t), kind: 'error' })
    } finally {
      setBusy(null)
      table.refresh()
    }
  }

  return (
    <section aria-labelledby="my-calls" className="space-y-2">
      <h2 id="my-calls" className="text-xl">
        {t('table.call.mine')}
      </h2>
      <ul className="space-y-2">
        {shown.map((call) => (
          <Card as="li" key={call.id} className="flex items-center gap-3 p-3">
            <Icon name={OPTIONS.find((o) => o.type === call.type)?.icon ?? 'bell'} className="size-7 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink">
                {t(CALL_LABEL[call.type])}
                <span className="font-normal text-muted">
                  {' · '}
                  <span dir="ltr">{formatTime(lang, call.createdAt)}</span>
                </span>
              </p>
              {call.note && <p className="truncate text-sm text-muted">{call.note}</p>}
              <p className={`flex items-center gap-1 text-base ${call.status === 'ACKNOWLEDGED' ? 'font-bold text-accent' : 'text-muted'}`}>
                {call.status === 'RESOLVED' && <Icon name="check" className="size-4 text-success" />}
                {t(STATUS_LABEL[call.status])}
              </p>
            </div>
            {isOpenCall(call) && (
              <Button variant="ghost" size="sm" disabled={busy === call.id} onClick={() => void withdraw(call.id)} className="shrink-0 text-ink">
                {t('table.call.withdraw')}
              </Button>
            )}
          </Card>
        ))}
      </ul>
    </section>
  )
}

/**
 * The big "Call waiter" button for the bottom of the table home (thumb reach) and its sheet. While the guest has to
 * wait, the button says so with a live countdown instead of silently doing nothing. Off (with the reason above it)
 * while the table can't take requests.
 */
export function CallWaiterBar() {
  const { t } = useT()
  const table = useTable()
  const [open, setOpen] = useState(false)
  const [localUntil, setLocalUntil] = useState(0)
  const wait = useCallWait(localUntil)
  const closed = !table.poll.session.orderingOpen
  const openCalls = table.poll.myCalls.filter(isOpenCall).length
  useHistoryLayer(open, () => setOpen(false))

  return (
    <>
      <div className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-20 bg-gradient-to-t from-canvas via-canvas/95 to-canvas/0 px-4 pb-3 pt-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
        <div className="mx-auto max-w-xl">
          <Button size="lg" className="w-full !min-h-16 text-xl" disabled={closed || wait > 0} onClick={() => setOpen(true)} aria-haspopup="dialog">
            <Icon name={wait > 0 ? 'check' : 'bell'} className="size-7" />
            {wait > 0 ? (
              <span>
                {openCalls > 0 ? t('table.call.called') : t('table.call.title')}
                {' · '}
                <Fill text={t('table.call.againShort')} values={{ time: formatWait(wait) }} />
              </span>
            ) : (
              <span>{t('table.call.title')}</span>
            )}
          </Button>
        </div>
      </div>
      {open && <CallSheet onClose={() => setOpen(false)} wait={wait} onCooldown={setLocalUntil} />}
    </>
  )
}

export { MyCalls }
