import type { TableSessionPoll } from '../../api/table'
import { useT } from '../../i18n'

/** "Ali Khan" -> "AK", "سارہ" -> "س": the first letter of the first two words. */
const initials = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toLocaleUpperCase()

// The accents in small doses, always with ink text (brand rule: text on sunflower and sky is ink). Mine is the action fill.
const TINTS = ['bg-sunflower', 'bg-sky', 'bg-band']

/** A guest's circle; `index` is their place at the table, so each keeps one colour across screens. */
export function Avatar({ name, index, me = false, size = 'md' }: { name: string; index: number; me?: boolean; size?: 'sm' | 'md' }) {
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${size === 'sm' ? 'size-8 text-sm' : 'size-12 text-lg'} ${
        me ? 'bg-action text-on-action ring-2 ring-ink ring-offset-2 ring-offset-canvas' : `${TINTS[index % TINTS.length]} text-ink`
      }`}
    >
      {initials(name)}
    </span>
  )
}

/** Who is at the table: everyone's circle with their name under it, me first and marked "You". */
export function GuestAvatars({ guests }: { guests: TableSessionPoll['guests'] }) {
  const { t } = useT()
  const ordered = guests.map((g, i) => ({ ...g, index: i })).sort((a, b) => Number(b.isMe) - Number(a.isMe))
  return (
    <ul aria-label={t('table.atTable')} className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
      {ordered.map((guest) => (
        <li key={guest.id} className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
          <Avatar name={guest.displayName} index={guest.index} me={guest.isMe} />
          <span className={`w-full truncate text-sm ${guest.isMe ? 'font-bold text-ink' : 'text-muted'}`}>{guest.isMe ? t('table.you') : guest.displayName}</span>
        </li>
      ))}
    </ul>
  )
}
