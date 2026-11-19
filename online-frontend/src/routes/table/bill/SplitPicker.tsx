import { useId, useState, type ReactNode } from 'react'
import { ApiError } from '../../../api/client'
import { setClaim, setSplit, type SharedLine, type SplitMode, type TableBill } from '../../../api/table'
import { Fill } from '../../../components/Fill'
import { Icon } from '../../../components/Icon'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { QuantityStepper } from '../../../components/ui/QuantityStepper'
import { formatRs } from '../../../lib/format'
import { pick } from '../../../lib/localized'
import { showToast } from '../../../lib/toast'
import { useT } from '../../../i18n'
import { Avatar } from '../GuestAvatars'
import { endsSession, useTable } from '../TableContext'
import { tableErrorText } from '../tableErrors'
import { equalPreview, fromPaisa, parseCustomAmount, toPaisa, unassignedPaisa } from './billMath'

const MAX_SHARES = 20

/**
 * The "Rs X left to assign" bar: a track that fills as the bill gets assigned, the amount in words beside it, and
 * a check once nothing is left. Meaning never rests on the colour alone.
 */
export function LeftToAssign({ leftPaisa, totalPaisa }: { leftPaisa: number; totalPaisa: number }) {
  const { t } = useT()
  const done = leftPaisa === 0
  const over = leftPaisa < 0
  return (
    <div role="status" aria-live="polite" className={`space-y-2 rounded-card p-3 ${done ? 'bg-success text-on-action' : 'bg-band text-ink'}`}>
      <p className="flex items-center gap-2 text-lg font-bold">
        <Icon name={done ? 'check' : 'alert'} className="size-6 shrink-0" />
        {done ? (
          <span>{t('bill.split.allAssigned')}</span>
        ) : over ? (
          <Fill text={t('bill.split.over')} values={{ amount: formatRs(fromPaisa(-leftPaisa)) }} />
        ) : (
          <Fill text={t('bill.split.left')} values={{ amount: formatRs(fromPaisa(leftPaisa)) }} />
        )}
      </p>
      <progress
        max={Math.max(totalPaisa, 1)}
        value={Math.min(totalPaisa, Math.max(0, totalPaisa - leftPaisa))}
        className="block h-2 w-full appearance-none overflow-hidden rounded-full [&::-moz-progress-bar]:bg-current [&::-webkit-progress-bar]:bg-ink/15 [&::-webkit-progress-value]:bg-current"
      >
        {fromPaisa(totalPaisa - leftPaisa)}
      </progress>
    </div>
  )
}

/** A per-person amount row (the live preview, or the server's final shares). */
function PersonRow({ name, amount, index, me }: { name: string; amount: string; index: number; me: boolean }) {
  const { t } = useT()
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={name} index={index} me={me} size="sm" />
      <span className={`min-w-0 flex-1 truncate ${me ? 'font-bold text-ink' : 'text-ink'}`}>{me ? `${name} (${t('table.you')})` : name}</span>
      <span dir="ltr" className="num shrink-0 text-lg text-ink">
        {formatRs(amount)}
      </span>
    </li>
  )
}

/** A failed split / claim: a stale bill just redraws; anything else is said in words. */
function useBillErrors() {
  const { t } = useT()
  const table = useTable()
  return (error: unknown) => {
    if (endsSession(error, table)) return
    if (error instanceof ApiError && error.code === 'BILL_CHANGED') table.refresh()
    showToast({ message: tableErrorText(error, t), kind: 'error' })
  }
}

// ---------- Equal ----------

function EqualTab({ bill, onConfirmed }: { bill: TableBill; onConfirmed: () => void }) {
  const { t } = useT()
  const table = useTable()
  const fail = useBillErrors()
  const [parts, setParts] = useState(() => Math.min(MAX_SHARES, Math.max(1, table.poll.guests.length)))
  const [busy, setBusy] = useState(false)
  const totalPaisa = toPaisa(bill.total)
  const preview = equalPreview(totalPaisa, parts)

  const confirm = async () => {
    setBusy(true)
    try {
      await setSplit(table.token, { mode: 'EQUAL', parts, expectedVersion: bill.version })
      onConfirmed()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-lg font-bold">{t('bill.split.parts')}</p>
        <QuantityStepper value={parts} min={1} noIncrease={parts >= MAX_SHARES} onChange={(next) => setParts(Math.max(1, Math.min(MAX_SHARES, next)))} className="w-40" />
      </div>
      <ul className="divide-y divide-ink/10 rounded-card bg-surface px-4 shadow-soft">
        {preview.map((paisa, i) => (
          <li key={i} className="flex items-center justify-between gap-3 py-2">
            <Fill text={t('bill.share.n')} values={{ n: String(i + 1), of: String(parts) }} />
            <span dir="ltr" className="num text-lg">
              {formatRs(fromPaisa(paisa))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-base text-muted">{t('bill.split.equalHint')}</p>
      <LeftToAssign leftPaisa={0} totalPaisa={totalPaisa} />
      <ConfirmButton busy={busy} onClick={() => void confirm()} />
    </div>
  )
}

// ---------- By items ----------

function LineRow({ line, mine, busy, onToggle }: { line: SharedLine; mine: boolean; busy: boolean; onToggle: () => void }) {
  const { t, lang } = useT()
  const name = pick(lang, line.name, line.nameUr) ?? line.name
  return (
    <li>
      <label className={`flex min-h-touch cursor-pointer items-center gap-3 rounded-inner px-3 py-2 ${mine ? 'bg-band' : ''}`}>
        <input type="checkbox" checked={mine} disabled={busy} onChange={onToggle} className="size-6 shrink-0 accent-action" />
        <span className="min-w-0 flex-1">
          <span className="block break-words font-bold text-ink">
            <span dir="ltr" className="num">
              {line.quantity} ×
            </span>{' '}
            {name}
            {line.size && <span className="font-normal text-muted"> ({line.size})</span>}
          </span>
          <span className="block text-sm text-muted">
            {line.claimedBy.length > 0 ? (
              <Fill text={t('bill.items.tickedBy')} values={{ names: line.claimedBy.join('، ') }} />
            ) : line.ownerName ? (
              <Fill text={t('bill.items.orderedBy')} values={{ name: line.ownerName }} />
            ) : (
              t('bill.items.nobody')
            )}
          </span>
        </span>
        <span dir="ltr" className="num shrink-0 text-ink">
          {formatRs(line.lineTotal)}
        </span>
      </label>
    </li>
  )
}

function ByItemsTab({ bill, onConfirmed }: { bill: TableBill; onConfirmed: () => void }) {
  const { t, lang } = useT()
  const table = useTable()
  const fail = useBillErrors()
  const [busy, setBusy] = useState<string | null>(null)
  const active = bill.splitMode === 'BY_ITEMS' && bill.shares.length > 0
  const totalPaisa = toPaisa(bill.total)

  const start = async () => {
    setBusy('start')
    try {
      await setSplit(table.token, { mode: 'BY_ITEMS', expectedVersion: bill.version })
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  if (!active) {
    return (
      <div className="space-y-4">
        <p className="text-lg">{t('bill.items.intro')}</p>
        <Button size="lg" className="w-full" disabled={busy !== null} onClick={() => void start()}>
          <Icon name="list" />
          <span>{busy ? t('checkout.sending') : t('bill.items.start')}</span>
        </Button>
      </div>
    )
  }

  const claimed = new Set(bill.myClaims.map((claim) => `${claim.lineKind}:${claim.lineId}`))
  const toggle = async (line: SharedLine) => {
    const key = `${line.lineKind}:${line.lineId}`
    setBusy(key)
    try {
      await setClaim(table.token, { lineKind: line.lineKind, lineId: line.lineId, claimed: !claimed.has(key), expectedVersion: bill.version })
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }
  // My own rounds are mine already: listed for reference, not tickable.
  const myLines = table.poll.rounds
    .filter((round) => round.isMine && round.status !== 'CANCELLED')
    .flatMap((round) => round.lines.filter((line) => line.ownerGuestId === table.poll.me.guestId))
  const tableLines = bill.sharedLines.filter((line) => line.ownerName === null)
  const othersLines = bill.sharedLines.filter((line) => line.ownerName !== null)
  const left = unassignedPaisa(bill)
  const guestIndex = new Map(table.poll.guests.map((guest, i) => [guest.id, i]))

  return (
    <div className="space-y-5">
      <p className="text-base text-muted">{t('bill.items.howTo')}</p>

      {tableLines.length > 0 && (
        <section aria-labelledby="items-table" className="space-y-2">
          <h3 id="items-table" className="text-xl">
            {t('bill.items.table')}
          </h3>
          <ul className="space-y-1">
            {tableLines.map((line) => (
              <LineRow key={line.lineId} line={line} mine={claimed.has(`${line.lineKind}:${line.lineId}`)} busy={busy !== null} onToggle={() => void toggle(line)} />
            ))}
          </ul>
        </section>
      )}

      {myLines.length > 0 && (
        <section aria-labelledby="items-mine" className="space-y-2">
          <h3 id="items-mine" className="text-xl">
            {t('bill.items.mine')}
          </h3>
          <ul className="space-y-1 rounded-inner bg-band p-2">
            {myLines.map((line) => (
              <li key={line.lineId} className="flex items-center gap-3 px-1 py-1">
                <Icon name="check" className="size-5 shrink-0 text-success" />
                <span className="min-w-0 flex-1 break-words">
                  <span dir="ltr" className="num">
                    {line.quantity} ×
                  </span>{' '}
                  {pick(lang, line.name, line.nameUr) ?? line.name}
                </span>
                <span dir="ltr" className="num shrink-0">
                  {formatRs(line.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {othersLines.length > 0 && (
        <details className="group space-y-2">
          <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 text-lg font-bold text-accent">
            <Icon name="arrow" mirror className="size-5 transition-transform duration-[var(--dur-press)] group-open:rotate-90" />
            {t('bill.items.others')}
          </summary>
          <p className="text-base text-muted">{t('bill.items.othersHint')}</p>
          <ul className="space-y-1">
            {othersLines.map((line) => (
              <LineRow key={line.lineId} line={line} mine={claimed.has(`${line.lineKind}:${line.lineId}`)} busy={busy !== null} onToggle={() => void toggle(line)} />
            ))}
          </ul>
        </details>
      )}

      <section aria-labelledby="items-people" className="space-y-1">
        <h3 id="items-people" className="text-xl">
          {t('bill.split.perPerson')}
        </h3>
        <ul className="divide-y divide-ink/10 rounded-card bg-surface px-4 shadow-soft">
          {bill.shares.map((share) => (
            <PersonRow key={share.id} name={share.label} amount={share.amount} index={guestIndex.get(share.guestId ?? '') ?? share.position} me={share.isMine} />
          ))}
        </ul>
      </section>

      <LeftToAssign leftPaisa={left} totalPaisa={totalPaisa} />
      <ConfirmButton busy={false} disabled={left !== 0} onClick={onConfirmed} />
    </div>
  )
}

// ---------- Custom ----------

function CustomTab({ bill, onConfirmed }: { bill: TableBill; onConfirmed: () => void }) {
  const { t } = useT()
  const table = useTable()
  const fail = useBillErrors()
  const baseId = useId()
  const totalPaisa = toPaisa(bill.total)
  const [rows, setRows] = useState<string[]>(() => {
    const parts = Math.min(MAX_SHARES, Math.max(2, table.poll.guests.length))
    return equalPreview(totalPaisa, parts).map((paisa) => fromPaisa(paisa).replace(/\.00$/, ''))
  })
  const [busy, setBusy] = useState(false)
  const parsed = rows.map((row, i) => parseCustomAmount(row, i === 0))
  const valid = parsed.every((value) => value !== null)
  const left = totalPaisa - parsed.reduce<number>((sum, value) => sum + (value ?? 0), 0)

  const update = (i: number, value: string) => setRows((current) => current.map((row, j) => (j === i ? value : row)))
  const confirm = async () => {
    setBusy(true)
    try {
      await setSplit(table.token, { mode: 'CUSTOM', shares: rows.map((row) => ({ amount: row.trim() })), expectedVersion: bill.version })
      onConfirmed()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-base text-muted">{t('bill.custom.hint')}</p>
      <ul className="space-y-2">
        {rows.map((row, i) => {
          const id = `${baseId}-${i}`
          const bad = parsed[i] === null
          return (
            <li key={i} className="flex items-center gap-3">
              <label htmlFor={id} className="w-28 shrink-0 font-bold">
                <Fill text={t('bill.share.short')} values={{ n: String(i + 1) }} />
              </label>
              <div className="relative min-w-0 flex-1">
                <span aria-hidden="true" className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-muted">
                  Rs
                </span>
                <input
                  id={id}
                  dir="ltr"
                  value={row}
                  inputMode={i === 0 ? 'decimal' : 'numeric'}
                  enterKeyHint="next"
                  autoComplete="off"
                  aria-invalid={bad || undefined}
                  onChange={(event) => update(i, event.target.value.replace(/[^\d.]/g, ''))}
                  className={`num min-h-touch w-full rounded-inner border bg-surface pe-4 ps-12 text-end text-xl text-ink ${bad ? 'border-error' : 'border-muted'}`}
                />
              </div>
              <button
                type="button"
                disabled={rows.length <= 1}
                onClick={() => setRows((current) => current.filter((_, j) => j !== i))}
                aria-label={t('bill.custom.remove')}
                className="flex size-tap shrink-0 items-center justify-center rounded-full border border-ink/20 text-ink disabled:opacity-30"
              >
                <Icon name="minus" />
              </button>
            </li>
          )
        })}
      </ul>
      {!valid && <p className="text-base font-bold text-error">{t('bill.custom.wholeRupees')}</p>}
      <Button variant="secondary" className="w-full text-ink" disabled={rows.length >= MAX_SHARES} onClick={() => setRows((current) => [...current, '0'])}>
        <Icon name="plus" />
        <span>{t('bill.custom.add')}</span>
      </Button>
      <LeftToAssign leftPaisa={left} totalPaisa={totalPaisa} />
      <ConfirmButton busy={busy} disabled={!valid || left !== 0} onClick={() => void confirm()} />
    </div>
  )
}

function ConfirmButton({ busy, disabled = false, onClick }: { busy: boolean; disabled?: boolean; onClick: () => void }) {
  const { t } = useT()
  return (
    <div className="sticky bottom-[calc(var(--tabbar-h)+0.5rem)] z-10 pt-2">
      <Button size="lg" className="w-full shadow-raised" disabled={busy || disabled} aria-busy={busy || undefined} onClick={onClick}>
        <Icon name="check" />
        <span>{busy ? t('checkout.sending') : t('bill.split.confirm')}</span>
      </Button>
    </div>
  )
}

const TABS: { mode: SplitMode; icon: 'users' | 'list' | 'cash'; label: 'bill.split.equal' | 'bill.split.items' | 'bill.split.custom' }[] = [
  { mode: 'EQUAL', icon: 'users', label: 'bill.split.equal' },
  { mode: 'BY_ITEMS', icon: 'list', label: 'bill.split.items' },
  { mode: 'CUSTOM', icon: 'cash', label: 'bill.split.custom' },
]

/**
 * How the table splits the bill: Equal (a number of shares), By items (each guest ticks what they had; several
 * guests can tick the same shared item) or Custom (typed amounts). Each shows a live per-share preview and the
 * "left to assign" bar; Confirm stays disabled until nothing is left. The server answers the final amounts.
 */
export function SplitPicker({ bill, onConfirmed, header }: { bill: TableBill; onConfirmed: () => void; header?: ReactNode }) {
  const { t } = useT()
  const [mode, setMode] = useState<SplitMode>(bill.splitMode ?? 'EQUAL')
  const tabId = useId()

  return (
    <Card as="section" aria-labelledby={`${tabId}-h`} className="space-y-4 p-4">
      <h2 id={`${tabId}-h`} className="text-2xl">
        {t('bill.split.title')}
      </h2>
      {header}
      <div role="tablist" aria-label={t('bill.split.title')} className="grid grid-cols-3 gap-1 rounded-full bg-band p-1">
        {TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            id={`${tabId}-${tab.mode}`}
            aria-selected={mode === tab.mode}
            aria-controls={`${tabId}-panel`}
            onClick={() => setMode(tab.mode)}
            className={`flex min-h-touch flex-col items-center justify-center rounded-full px-1 text-sm font-bold transition-colors duration-[var(--dur-press)] min-[400px]:flex-row min-[400px]:gap-1.5 min-[400px]:text-base ${
              mode === tab.mode ? 'bg-action text-on-action shadow-soft' : 'text-ink'
            }`}
          >
            <Icon name={tab.icon} className="size-5" />
            <span className="truncate">{t(tab.label)}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${mode}`}>
        {mode === 'EQUAL' && <EqualTab bill={bill} onConfirmed={onConfirmed} />}
        {mode === 'BY_ITEMS' && <ByItemsTab bill={bill} onConfirmed={onConfirmed} />}
        {mode === 'CUSTOM' && <CustomTab bill={bill} onConfirmed={onConfirmed} />}
      </div>
    </Card>
  )
}
