import { useState } from 'react'
import { ApiError } from '../../../api/client'
import type { PaymentAccount } from '../../../api/store'
import { useStore } from '../../../api/store'
import { claimShare, payShare, uploadShareProof, type BillShare, type TableBill } from '../../../api/table'
import { Fill } from '../../../components/Fill'
import { Icon, type IconName } from '../../../components/Icon'
import { ProofUpload } from '../../../components/mobile/orders/PaymentSteps'
import { AccountCard } from '../../../components/order/PaymentBlock'
import { Button } from '../../../components/ui/Button'
import { Card } from '../../../components/ui/Card'
import { formatRs } from '../../../lib/format'
import { vibrate } from '../../../lib/haptics'
import { showToast } from '../../../lib/toast'
import { useT, type TranslationKey } from '../../../i18n'
import { endsSession, useTable } from '../TableContext'
import { tableErrorText } from '../tableErrors'

/** A share's state in words, with an icon and a tone (never colour alone). */
function shareState(share: BillShare): { label: TranslationKey; icon: IconName; tone: string } {
  if (share.status === 'VERIFIED') return { label: 'bill.st.paid', icon: 'check', tone: 'bg-success text-on-action' }
  if (share.status === 'PROOF_SUBMITTED') return { label: 'bill.st.checking', icon: 'clock', tone: 'bg-sunflower text-ink' }
  if (share.status === 'REJECTED') return { label: 'bill.st.problem', icon: 'alert', tone: 'bg-error text-on-action' }
  if (share.cashRequested) return { label: 'bill.st.cash', icon: 'cash', tone: 'bg-sky text-ink' }
  return { label: 'bill.st.unpaid', icon: 'clock', tone: 'bg-band text-ink' }
}

export function ShareChip({ share }: { share: BillShare }) {
  const { t } = useT()
  const state = shareState(share)
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-0.5 text-sm font-bold ${state.tone}`}>
      <Icon name={state.icon} className="size-4" />
      {t(state.label)}
    </span>
  )
}

function useShareErrors() {
  const { t } = useT()
  const table = useTable()
  return (error: unknown) => {
    if (endsSession(error, table)) return
    if (error instanceof ApiError && error.code === 'BILL_CHANGED') table.refresh()
    showToast({ message: tableErrorText(error, t), kind: 'error' })
  }
}

/** Every share of the table with its status ("2 of 3 paid"); unclaimed equal/custom shares get "This is mine". */
export function SharesBoard({ bill }: { bill: TableBill }) {
  const { t } = useT()
  const table = useTable()
  const fail = useShareErrors()
  const [busy, setBusy] = useState<string | null>(null)
  const paid = bill.shares.filter((share) => share.status === 'VERIFIED').length

  const take = async (share: BillShare) => {
    setBusy(share.id)
    try {
      await claimShare(table.token, share.id, bill.version)
      vibrate(12)
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card as="section" aria-labelledby="shares-h" className="space-y-3 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="shares-h" className="text-2xl">
          {t('bill.shares.title')}
        </h2>
        <p className="text-base font-bold text-muted">
          <Fill text={t('bill.shares.paidOf')} values={{ paid: String(paid), of: String(bill.shares.length) }} />
        </p>
      </div>
      <ul className="divide-y divide-ink/10">
        {bill.shares.map((share) => (
          <li key={share.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 py-3 ${share.isMine ? 'font-bold' : ''}`}>
            <span className="min-w-0 flex-1 truncate text-ink">
              {share.label}
              {share.isMine && <span className="text-accent"> · {t('table.you')}</span>}
            </span>
            <span dir="ltr" className="num shrink-0 text-lg text-ink">
              {formatRs(share.amount)}
            </span>
            <span className="flex w-full items-center justify-between gap-2">
              <ShareChip share={share} />
              {share.guestId === null && (
                <Button size="sm" variant="secondary" className="text-ink" disabled={busy !== null} onClick={() => void take(share)}>
                  <Icon name="user" className="size-5" />
                  <span>{busy === share.id ? t('checkout.sending') : t('bill.shares.mine')}</span>
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** Paying one of my shares: cash (the waiter comes) or online (accounts, copy, QR, screenshot). */
function MyShareCard({ share, bill, blocked }: { share: BillShare; bill: TableBill; blocked: boolean }) {
  const { t } = useT()
  const table = useTable()
  const fail = useShareErrors()
  const store = useStore()
  const [busy, setBusy] = useState<'CASH' | 'ONLINE' | null>(null)
  const [accounts, setAccounts] = useState<PaymentAccount[] | null>(null)
  const [copied, setCopied] = useState(false)
  const amount = formatRs(share.amount)
  const paying = share.status === 'UNPAID' || share.status === 'REJECTED' || share.status === 'PROOF_SUBMITTED'
  const online = share.method === 'ONLINE' || accounts !== null
  const shownAccounts = accounts ?? store.data?.paymentAccounts ?? []

  const pay = async (method: 'CASH' | 'ONLINE') => {
    setBusy(method)
    try {
      const answer = await payShare(table.token, share.id, method)
      if (method === 'ONLINE') setAccounts(answer.paymentAccounts ?? [])
      else {
        setAccounts(null)
        vibrate([15, 40, 25])
        showToast({ message: t('bill.pay.cashCalled'), kind: 'success' })
      }
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  if (share.status === 'VERIFIED') {
    return (
      <div role="status" className="flex items-center gap-3 rounded-card bg-success p-4 text-xl font-bold text-on-action">
        <Icon name="check" className="size-8" />
        <span>
          <Fill text={t('bill.pay.done')} values={{ amount }} />
        </span>
      </div>
    )
  }

  return (
    <Card as="section" aria-labelledby={`my-${share.id}`} className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`my-${share.id}`} className="text-2xl">
          {t('bill.pay.myShare')}
        </h2>
        <ShareChip share={share} />
      </div>
      <p dir="ltr" className="num text-start text-4xl text-ink">
        {amount}
      </p>

      {share.status === 'REJECTED' && (
        <p role="alert" className="flex items-start gap-2 font-bold text-error">
          <Icon name="alert" className="mt-1 size-5 shrink-0" />
          <span>
            {t('bill.pay.rejected')}
            {share.rejectedReason ? ` ${share.rejectedReason}` : ''}
          </span>
        </p>
      )}
      {share.status === 'PROOF_SUBMITTED' && (
        <p role="status" className="flex items-start gap-2">
          <Icon name="clock" className="mt-1 size-5 shrink-0 text-accent" />
          <span>{t('bill.pay.checking')}</span>
        </p>
      )}
      {share.cashRequested && !online && (
        <p role="status" className="flex items-start gap-2 rounded-inner bg-band p-3 text-lg">
          <Icon name="cash" className="mt-1 size-6 shrink-0 text-accent" />
          <Fill text={t('bill.pay.cashWaiting')} values={{ amount }} />
        </p>
      )}
      {blocked && <p className="text-base font-bold text-accent">{t('bill.pay.waitItems')}</p>}

      {paying && !online && share.status !== 'PROOF_SUBMITTED' && (
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <Button size="lg" variant={share.cashRequested ? 'secondary' : 'primary'} className={share.cashRequested ? 'text-ink' : ''} disabled={blocked || busy !== null} onClick={() => void pay('CASH')}>
            <Icon name="cash" />
            <span>{busy === 'CASH' ? t('checkout.sending') : t('bill.pay.cash')}</span>
          </Button>
          <Button size="lg" variant={share.cashRequested ? 'primary' : 'secondary'} className={share.cashRequested ? '' : 'text-ink'} disabled={blocked || busy !== null} onClick={() => void pay('ONLINE')}>
            <Icon name="mobile" />
            <span>{busy === 'ONLINE' ? t('checkout.sending') : share.cashRequested ? t('bill.pay.onlineInstead') : t('bill.pay.online')}</span>
          </Button>
        </div>
      )}

      {paying && online && (
        <div className="space-y-4">
          <p className="text-lg font-bold">
            <Fill text={t('bill.pay.step1')} values={{ amount }} />
          </p>
          {shownAccounts.length > 0 ? (
            <ul className="space-y-3">
              {shownAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onCopied={() => {
                    setCopied(true)
                    showToast({ message: t('order.pay.copied'), kind: 'success' })
                  }}
                />
              ))}
            </ul>
          ) : (
            <p>{t('bill.pay.noAccounts')}</p>
          )}
          <p className="text-lg font-bold">{share.status === 'PROOF_SUBMITTED' ? t('bill.pay.replace') : t('bill.pay.step2')}</p>
          <ProofUpload upload={(file) => uploadShareProof(table.token, share.id, file)} onDone={table.refresh} />
          {share.status !== 'PROOF_SUBMITTED' && (
            <Button variant="ghost" className="w-full text-ink" disabled={blocked || busy !== null} onClick={() => void pay('CASH')}>
              <Icon name="cash" />
              <span>{t('bill.pay.cashInstead')}</span>
            </Button>
          )}
          {copied && <span className="sr-only">{t('order.pay.copied')}</span>}
        </div>
      )}
      {bill.splitMode === 'EQUAL' || bill.splitMode === 'CUSTOM' ? <p className="text-sm text-muted">{t('bill.pay.forFriend')}</p> : null}
    </Card>
  )
}

/** My shares (usually one; someone paying for a friend may take two). Pay stays off while items are left to assign. */
export function MyShares({ bill, blocked }: { bill: TableBill; blocked: boolean }) {
  const { t } = useT()
  const mine = bill.shares.filter((share) => share.isMine)
  if (mine.length === 0) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-card bg-band p-4 text-lg">
        <Icon name="user" className="mt-1 size-6 shrink-0" />
        <span>{bill.splitMode === 'BY_ITEMS' ? t('bill.pay.nothingMine') : t('bill.pay.takeOne')}</span>
      </p>
    )
  }
  return (
    <div className="space-y-4">
      {mine.map((share) => (
        <MyShareCard key={share.id} share={share} bill={bill} blocked={blocked} />
      ))}
    </div>
  )
}
