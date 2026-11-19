import type { RoundStatus } from '../../api/table'
import type { IconName } from '../../components/Icon'
import type { Lang, TranslationKey } from '../../i18n'

// A round's progress as the guest sees it: Awaiting reception -> Preparing -> Ready -> Served. "Sent to the kitchen"
// (accepted, nothing started yet) sits on the Preparing step, with its own wording.
export const ROUND_STEPS: { key: string; icon: IconName; label: TranslationKey }[] = [
  { key: 'RECEIVED', icon: 'clock', label: 'table.st.RECEIVED' },
  { key: 'PREPARING', icon: 'food', label: 'table.st.PREPARING' },
  { key: 'READY', icon: 'bell', label: 'table.st.READY' },
  { key: 'SERVED', icon: 'cup', label: 'table.st.SERVED' },
]

const STEP_INDEX: Record<Exclude<RoundStatus, 'CANCELLED'>, number> = { RECEIVED: 0, SENT_TO_KITCHEN: 1, PREPARING: 1, READY: 2, SERVED: 3 }

export const roundStep = (status: Exclude<RoundStatus, 'CANCELLED'>): number => STEP_INDEX[status]

/** The words for where a round is right now (also for a cancelled one). */
export const ROUND_LABEL: Record<RoundStatus, TranslationKey> = {
  RECEIVED: 'table.st.RECEIVED',
  SENT_TO_KITCHEN: 'table.st.SENT_TO_KITCHEN',
  PREPARING: 'table.st.PREPARING',
  READY: 'table.st.READY',
  SERVED: 'table.st.SERVED',
  CANCELLED: 'table.st.CANCELLED',
}

/** Still on its way to the table (shows as "in progress"). */
export const isActiveRound = (status: RoundStatus): boolean => status !== 'SERVED' && status !== 'CANCELLED'

/** "7:42 pm", Western digits in both languages. */
export const formatTime = (lang: Lang, iso: string): string =>
  new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK-u-nu-latn' : 'en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso))
