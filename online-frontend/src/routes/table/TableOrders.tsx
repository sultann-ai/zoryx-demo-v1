import { useState } from 'react'
import type { Round, RoundLine } from '../../api/table'
import { Fill } from '../../components/Fill'
import { Icon } from '../../components/Icon'
import { ButtonRoute } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { CategoryChip } from '../../components/ui/Chip'
import { formatRs } from '../../lib/format'
import { useT } from '../../i18n'
import { Avatar } from './GuestAvatars'
import { LineText } from './RoundCard'
import { tablePath, useTable } from './TableContext'
import { ROUND_LABEL } from './roundStatus'

interface Group {
  key: string
  name: string
  me: boolean
  index: number
  lines: { line: RoundLine; round: Round; number: number }[]
  total: number
}

const SHARED = 'shared'

/**
 * Everything the table has ordered so far, tagged by who added it: one card per guest (me first, then in the order
 * they joined; lines staff added are "Table (shared)"), each line with its round's status. Cancelled rounds are left
 * out of the list and the totals. A chip row narrows it to one guest.
 */
export default function TableOrders() {
  const { t } = useT()
  const { poll, qrKey } = useTable()
  const [only, setOnly] = useState<string | null>(null)

  const groups = new Map<string, Group>()
  const guestIndex = new Map(poll.guests.map((g, i) => [g.id, i]))
  poll.rounds.forEach((round, i) => {
    if (round.status === 'CANCELLED') return
    for (const line of round.lines) {
      const key = line.ownerGuestId ?? SHARED
      let group = groups.get(key)
      if (!group) {
        const guest = poll.guests.find((g) => g.id === key)
        group = {
          key,
          // A guest staff removed is no longer in the list: their round still carries the name.
          name: key === SHARED ? t('table.shared') : (guest?.displayName ?? round.guestName ?? t('table.shared')),
          me: guest?.isMe ?? false,
          index: guestIndex.get(key) ?? poll.guests.length,
          lines: [],
          total: 0,
        }
        groups.set(key, group)
      }
      group.lines.push({ line, round, number: i + 1 })
      group.total += Number.parseFloat(line.lineTotal) || 0
    }
  })
  const ordered = [...groups.values()].sort((a, b) => Number(b.me) - Number(a.me) || (a.key === SHARED ? 1 : 0) - (b.key === SHARED ? 1 : 0) || a.index - b.index)
  const tableTotal = ordered.reduce((sum, g) => sum + g.total, 0)
  const shown = only ? ordered.filter((g) => g.key === only) : ordered

  if (ordered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="flex size-24 items-center justify-center rounded-full bg-band">
          <Icon name="users" className="size-12" />
        </span>
        <h1 className="text-3xl leading-tight">{t('table.tab.title')}</h1>
        <p className="text-lg text-muted">{t('table.noRounds')}</p>
        {poll.session.orderingOpen && (
          <ButtonRoute to={tablePath(qrKey, 'menu')}>
            <Icon name="list" />
            <span>{t('table.openMenu')}</span>
          </ButtonRoute>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 pb-8 pt-3">
      <div className="flex items-end justify-between gap-3 px-4">
        <h1 className="text-h2 leading-tight">{t('table.tab.title')}</h1>
        <p className="text-end">
          <span className="block text-sm text-muted">{t('table.tab.total')}</span>
          <span dir="ltr" className="num text-xl text-ink">
            {formatRs(tableTotal)}
          </span>
        </p>
      </div>

      {ordered.length > 1 && (
        <ul aria-label={t('table.tab.filter')} className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-1">
          <li className="shrink-0">
            <CategoryChip active={only === null} onClick={() => setOnly(null)}>
              {t('table.tab.all')}
            </CategoryChip>
          </li>
          {ordered.map((group) => (
            <li key={group.key} className="shrink-0">
              <CategoryChip active={only === group.key} onClick={() => setOnly(group.key)}>
                {group.me ? t('table.you') : group.name}
              </CategoryChip>
            </li>
          ))}
        </ul>
      )}

      <ul className="space-y-3 px-4">
        {shown.map((group) => (
          <Card as="li" key={group.key} className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              {group.key === SHARED ? (
                <span aria-hidden="true" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-band text-ink">
                  <Icon name="users" />
                </span>
              ) : (
                <Avatar name={group.name} index={group.index} me={group.me} />
              )}
              <h2 className="min-w-0 flex-1 truncate text-xl">{group.me ? `${group.name} (${t('table.you')})` : group.name}</h2>
              <span dir="ltr" className="num shrink-0 text-lg text-ink">
                {formatRs(group.total)}
              </span>
            </div>
            <ul className="divide-y divide-ink/10">
              {group.lines.map(({ line, round, number }) => (
                <li key={line.lineId} className="flex items-start justify-between gap-3 py-2">
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
                    <p className="text-sm text-muted">
                      <Fill text={t('table.round.n')} values={{ n: String(number) }} /> · {t(ROUND_LABEL[round.status])}
                    </p>
                  </div>
                  <span dir="ltr" className="num shrink-0 text-ink">
                    {formatRs(line.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </ul>
      <p className="px-4 text-base text-muted">{t('table.tab.payNote')}</p>
    </div>
  )
}
