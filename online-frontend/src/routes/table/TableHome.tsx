import { Link } from 'react-router-dom'
import { Fill } from '../../components/Fill'
import { Icon } from '../../components/Icon'
import { ButtonRoute } from '../../components/ui/Button'
import { formatRs } from '../../lib/format'
import { useT } from '../../i18n'
import { CallWaiterBar, MyCalls } from './CallWaiter'
import { GuestAvatars } from './GuestAvatars'
import { RoundCard } from './RoundCard'
import { tablePath, useTable } from './TableContext'
import { ClosedNotice } from './TableStates'
import { isActiveRound } from './roundStatus'

/** The bill's entry on the table home: "Get the bill", or where the bill stands. */
function BillCard() {
  const { t } = useT()
  const { poll, qrKey } = useTable()
  const bill = poll.bill
  const paid = bill?.shares.filter((share) => share.status === 'VERIFIED').length ?? 0
  const hasRounds = poll.rounds.some((round) => round.status !== 'CANCELLED')
  if (!hasRounds && !bill) return null
  if (!bill || bill.status === 'UNLOCKED') {
    return (
      <div className="px-4">
        <ButtonRoute to={tablePath(qrKey, 'bill')} variant="secondary" size="lg" className="w-full text-ink">
          <Icon name="receipt" />
          <span>{t('bill.get')}</span>
        </ButtonRoute>
      </div>
    )
  }
  return (
    <Link to={tablePath(qrKey, 'bill')} className="card mx-4 flex min-h-touch items-center gap-3 p-4 text-ink">
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-full ${bill.status === 'PAID' ? 'bg-success text-on-action' : 'bg-sunflower text-ink'}`}>
        <Icon name={bill.status === 'PAID' ? 'check' : 'receipt'} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold">{bill.status === 'PAID' ? t('bill.card.paid') : t('bill.card.requested')}</span>
        <span className="block text-base text-muted">
          {bill.status === 'PAID' ? (
            t('bill.card.receipt')
          ) : bill.shares.length > 0 ? (
            <Fill text={t('bill.shares.paidOf')} values={{ paid: String(paid), of: String(bill.shares.length) }} />
          ) : (
            t('bill.card.split')
          )}
        </span>
      </span>
      <span dir="ltr" className="num shrink-0 text-lg">
        {formatRs(bill.total)}
      </span>
      <Icon name="arrow" mirror className="size-5 shrink-0" />
    </Link>
  )
}

/**
 * The table home: the table's name, who's at it, the round-by-round timeline (newest first, the ones still on their
 * way open), the bill, and the big Call waiter button pinned above the tab bar.
 */
export default function TableHome() {
  const { t } = useT()
  const { poll, qrKey } = useTable()
  const rounds = poll.rounds.map((round, i) => ({ round, number: i + 1 })).reverse()
  const count = poll.guests.length

  return (
    <div className="space-y-6 pb-32">
      {poll.session.closedReason && <ClosedNotice reason={poll.session.closedReason} />}
      {poll.table.movedFrom && (
        <p role="status" className="mx-4 flex items-start gap-2 rounded-card bg-sunflower p-3 text-ink">
          <Icon name="repeat" className="mt-1 size-5 shrink-0" />
          <span>
            <Fill text={t('table.moved')} values={{ from: poll.table.movedFrom.name, to: poll.table.name }} />
          </span>
        </p>
      )}
      {(poll.joinedTables ?? []).length > 0 && (
        <p role="status" className="mx-4 flex items-start gap-2 rounded-card bg-band p-3 text-ink">
          <Icon name="users" className="mt-1 size-5 shrink-0" />
          <span>
            <Fill text={t('table.joined')} values={{ tables: [poll.table.name, ...(poll.joinedTables ?? [])].join(' + ') }} />
          </span>
        </p>
      )}

      <section aria-labelledby="table-name" className="tone-dark mx-4 mt-3 space-y-4 rounded-card bg-forest p-5 text-on-action shadow-soft">
        <div>
          <p className="eyebrow">{t('table.welcome')}</p>
          <h1 id="table-name" className="text-h2 leading-tight">
            {[poll.table.name, ...(poll.joinedTables ?? [])].join(' + ')}
          </h1>
          {poll.table.area && <p className="text-lg">{poll.table.area}</p>}
        </div>
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-base">
            <Icon name="users" className="size-5" />
            <Fill text={t(count === 1 ? 'table.guestsOne' : 'table.guests')} values={{ n: String(count) }} />
          </p>
          <div className="tone-light rounded-inner bg-canvas p-3 text-ink">
            <GuestAvatars guests={poll.guests} />
          </div>
        </div>
      </section>

      <BillCard />

      <section aria-labelledby="rounds" className="space-y-3 px-4">
        <h2 id="rounds" className="text-xl">
          {t('table.rounds')}
        </h2>
        {rounds.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card bg-band p-6 text-center">
            <Icon name="food" className="size-10" />
            <p className="text-lg">{t('table.noRounds')}</p>
            {poll.session.orderingOpen && (
              <ButtonRoute to={tablePath(qrKey, 'menu')}>
                <Icon name="list" />
                <span>{t('table.openMenu')}</span>
              </ButtonRoute>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {rounds.map(({ round, number }) => (
              <RoundCard key={round.orderId} round={round} number={number} open={round.isMine && isActiveRound(round.status)} />
            ))}
          </ul>
        )}
      </section>

      <div className="px-4">
        <MyCalls />
      </div>

      <CallWaiterBar />
    </div>
  )
}
