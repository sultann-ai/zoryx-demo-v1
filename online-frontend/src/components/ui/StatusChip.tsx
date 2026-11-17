import { useStore } from '../../api/store'
import { useT } from '../../i18n'
import { Skeleton } from '../Skeleton'
import { Chip } from './Chip'

/** "Open - ordering available", or why we are closed. The words carry the meaning; the dot is decoration. Shared by Home and Menu. */
export function StatusChip() {
  const { t } = useT()
  const { data, isPending } = useStore()
  if (isPending) return <Skeleton className="h-9 w-56 max-w-full !rounded-full !bg-ink/10" />
  if (!data) return null
  if (data.orderingOpen) return <Chip dot>{t('home.open')}</Chip>
  const reasonKey = data.closedReason ? (`home.closed.${data.closedReason}` as const) : 'home.closed.unknown'
  return <Chip dot="closed">{t(reasonKey)}</Chip>
}
