import { useState } from 'react'
import { requestBill, useReceipt, type Round, type TableBill } from '../../../api/table'
import { Fill } from '../../../components/Fill'
import { Icon } from '../../../components/Icon'
import { ReceiptView } from '../../../components/receipt/ReceiptView'
import { Skeleton } from '../../../components/Skeleton'
import { Button, ButtonRoute } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { formatRs } from '../../../lib/format'
import { vibrate } from '../../../lib/haptics'
import { showToast } from '../../../lib/toast'
import { useT } from '../../../i18n'
import { LineText } from '../RoundCard'
import { endsSession, tablePath, useTable } from '../TableContext'
import { TableProblem } from '../TableStates'
import { tableErrorText } from '../tableErrors'
import { MyShares, SharesBoard } from './Shares'
import { SplitPicker } from './SplitPicker'
import { unassignedPaisa } from './billMath'

/** Every round the table still pays for (cancelled ones left out), each with its lines. */
function RoundsList({ rounds }: { rounds: { round: Round; number: number }[] }) {
  const { t } = useT()
  return (
    <ul className="space-y-3">
      {rounds.map(({ round, number }) => (
        <li key={round.orderId} className="space-y-1">
          <p className="flex items-baseline justify-between gap-3 text-base font-bold text-muted">
            <span>
              <Fill text={t('table.round.n')} values={{ n: String(number) }} />
              {' · '}
              {round.isMine ? t('table.you') : (round.guestName ?? t('table.shared'))}
            </span>
            <span dir="ltr" className="num">
              {formatRs(round.total)}
            </span>
          </p>
          <ul className="space-y-0.5">
            {round.lines.map((line) => (
              <li key={line.lineId} className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words">
                  <LineText line={line} />
                </span>
                <span dir="ltr" className="num shrink-0">
                  {formatRs(line.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

function Totals({ subtotal, discount, total, estimate = false }: { subtotal: string; discount: string; total: string; estimate?: boolean }) {
  const { t } = useT()
  return (
    <div className="space-y-1 border-t border-dashed border-ink/25 pt-3">
      <p className="flex justify-between gap-3">
        <span>{t('receipt.subtotal')}</span>
        <span dir="ltr" className="num">
          {formatRs(subtotal)}
        </span>
      </p>
      {Number.parseFloat(discount) > 0 && (
        <p className="flex justify-between gap-3 text-accent">
          <span>{t('receipt.discount')}</span>
          <span dir="ltr" className="num">
            − {formatRs(discount)}
          </span>
        </p>
      )}
      <p className="flex items-baseline justify-between gap-3 text-2xl font-bold text-ink">
        <span>{estimate ? t('bill.estimate') : t('receipt.total')}</span>
        <span dir="ltr" className="num">
          {formatRs(total)}
        </span>
      </p>
    </div>
  )
}

function useRounds() {
  const { poll } = useTable()
  return poll.rounds.map((round, i) => ({ round, number: i + 1 })).filter(({ round }) => round.status !== 'CANCELLED')
}

/** Before the bill: what the table ordered so far, and "Get the bill" (it pauses ordering for everyone). */
function BeforeBill({ reopened }: { reopened: boolean }) {
  const { t } = useT()
  const table = useTable()
  const rounds = useRounds()
  const [busy, setBusy] = useState(false)
  const estimate = rounds.reduce((sum, { round }) => sum + Number.parseFloat(round.total), 0).toFixed(2)

  const ask = async () => {
    setBusy(true)
    try {
      await requestBill(table.token)
      vibrate([15, 40, 25])
    } catch (error) {
      if (!endsSession(error, table)) showToast({ message: tableErrorText(error, t), kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  if (rounds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <span className="flex size-24 items-center justify-center rounded-full bg-band">
          <Icon name="receipt" className="size-12" />
        </span>
        <h1 className="text-3xl leading-tight">{t('bill.title')}</h1>
        <p className="text-lg text-muted">{t('bill.nothingYet')}</p>
        <ButtonRoute to={tablePath(table.qrKey, 'menu')}>
          <Icon name="list" />
          <span>{t('table.openMenu')}</span>
        </ButtonRoute>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 pb-36 pt-3">
      <h1 className="text-h2 leading-tight">{t('bill.title')}</h1>
      {reopened && (
        <p role="status" className="flex items-start gap-2 rounded-card bg-band p-3">
          <Icon name="repeat" className="mt-1 size-5 shrink-0" />
          <span>{t('bill.reopened')}</span>
        </p>
      )}
      <Card className="space-y-4 p-4">
        <RoundsList rounds={rounds} />
        <Totals subtotal={estimate} discount="0" total={estimate} estimate />
      </Card>
      <div className="fixed inset-x-0 bottom-[var(--tabbar-h)] z-20 bg-gradient-to-t from-canvas via-canvas/95 to-canvas/0 px-4 pb-3 pt-6">
        <div className="mx-auto max-w-xl space-y-2">
          <p className="text-center text-base text-muted">{t('bill.askNote')}</p>
          <Button size="lg" className="w-full !min-h-16 text-xl" disabled={busy} aria-busy={busy || undefined} onClick={() => void ask()}>
            <Icon name="receipt" className="size-7" />
            <span>{busy ? t('checkout.sending') : t('bill.ask')}</span>
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The requested bill: the summary, the split (or its result), everyone's shares and my own share to pay. */
function OpenBill({ bill }: { bill: TableBill }) {
  const { t } = useT()
  const rounds = useRounds()
  const [changing, setChanging] = useState(false)
  // By items: this guest says "the amounts are right" once every shared item has someone.
  const [itemsDone, setItemsDone] = useState(false)
  const left = bill.splitMode === 'BY_ITEMS' ? unassignedPaisa(bill) : 0
  const split = bill.shares.length > 0
  const picking = !split || changing || (bill.splitMode === 'BY_ITEMS' && (!itemsDone || left > 0))

  return (
    <div className="space-y-4 px-4 pb-10 pt-3">
      <h1 className="text-h2 leading-tight">{t('bill.title')}</h1>

      {bill.blockedReason === 'ORDERS_AWAITING' && (
        <p role="status" className="flex items-start gap-2 rounded-card bg-sunflower p-3 text-ink">
          <Icon name="clock" className="mt-1 size-5 shrink-0" />
          <span>{t('bill.awaiting')}</span>
        </p>
      )}
      {bill.needsSplit && (
        <p role="alert" className="flex items-start gap-2 rounded-card bg-sunflower p-3 font-bold text-ink">
          <Icon name="alert" className="mt-1 size-5 shrink-0" />
          <span>{t('bill.changed')}</span>
        </p>
      )}

      <Card as="section" aria-labelledby="bill-summary" className="p-4">
        <details open={!split} className="group space-y-3">
          <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3">
            <span id="bill-summary" className="flex items-center gap-2 text-2xl font-bold">
              <Icon name="arrow" mirror className="size-5 transition-transform duration-[var(--dur-press)] group-open:rotate-90" />
              {t('bill.summary')}
            </span>
            <span dir="ltr" className="num text-2xl text-ink">
              {formatRs(bill.total)}
            </span>
          </summary>
          <RoundsList rounds={rounds} />
          <Totals subtotal={bill.subtotal} discount={bill.discount} total={bill.total} />
        </details>
      </Card>

      {picking && bill.blockedReason !== 'ORDERS_AWAITING' ? (
        <SplitPicker
          key={`${bill.splitMode ?? 'none'}`}
          bill={bill}
          onConfirmed={() => {
            setChanging(false)
            setItemsDone(true)
          }}
          header={
            changing ? (
              <Button variant="ghost" className="text-ink" onClick={() => setChanging(false)}>
                <Icon name="arrow" flip />
                <span>{t('bill.split.keep')}</span>
              </Button>
            ) : null
          }
        />
      ) : null}

      {split && !picking && (
        <>
          <MyShares bill={bill} blocked={left > 0} />
          <SharesBoard bill={bill} />
          {bill.canSplit && (
            <Button variant="secondary" className="w-full text-ink" onClick={() => setChanging(true)}>
              <Icon name="repeat" />
              <span>{t('bill.split.change')}</span>
            </Button>
          )}
        </>
      )}
    </div>
  )
}

/** Paid: every guest sees the same receipt (made the moment the last share was verified). */
function PaidBill({ bill, receiptKey }: { bill: TableBill; receiptKey: string | null }) {
  const { t } = useT()
  const receipt = useReceipt(receiptKey)
  return (
    <div className="space-y-4 px-4 pb-10 pt-3">
      <div role="status" className="no-print flex items-center gap-3 rounded-card bg-success p-4 text-on-action">
        <Icon name="check" className="size-9 shrink-0" />
        <div>
          <p className="text-xl font-bold">{t('bill.paid')}</p>
          <p>
            <Fill text={t('bill.paidBody')} values={{ amount: formatRs(bill.total) }} />
          </p>
        </div>
      </div>
      {receipt.isPending || !receiptKey ? (
        <div role="status" className="mx-auto max-w-md space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : receipt.isError ? (
        <TableProblem compact error={receipt.error} onRetry={() => void receipt.refetch()} />
      ) : (
        <ReceiptView receipt={receipt.data} receiptKey={receiptKey} />
      )}
    </div>
  )
}

/** /t/:qrKey/bill — the table's bill, in whatever state it is. */
export default function TableBillPage() {
  const { poll } = useTable()
  const bill = poll.bill
  if (!bill || bill.status === 'UNLOCKED') return <BeforeBill reopened={bill?.status === 'UNLOCKED'} />
  if (bill.status === 'PAID') return <PaidBill bill={bill} receiptKey={poll.receiptKey} />
  return <OpenBill bill={bill} />
}
