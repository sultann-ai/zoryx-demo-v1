import type { TableClosedReason } from '../../api/table'
import { Icon } from '../../components/Icon'
import { AppState } from '../../components/mobile/AppState'
import { Button } from '../../components/ui/Button'
import { useT } from '../../i18n'
import { ApiError } from '../../api/client'
import { CLOSED_TEXT, tableErrorText } from './tableErrors'

/**
 * A table call that failed outright (the lookup, the first poll, the menu): plain words and a retry. A rate-limit
 * refusal shows the server's own sentence; no connection says so.
 */
export function TableProblem({ error, onRetry, compact = false }: { error: unknown; onRetry: () => void; compact?: boolean }) {
  const { t } = useT()
  const offline = (error instanceof ApiError && error.status === 0) || !navigator.onLine
  return (
    <AppState
      role="alert"
      tone="warning"
      compact={compact}
      icon={offline ? 'wifi-off' : 'alert'}
      title={t(offline ? 'state.offlineTitle' : 'state.errorTitle')}
      body={offline ? t('table.offline') : tableErrorText(error, t)}
    >
      <Button onClick={onRetry}>
        <Icon name="repeat" />
        <span>{t('err.retry')}</span>
      </Button>
    </AppState>
  )
}

/** A calm notice above the Home and Menu of a joined guest while the table can't take orders (the day ended, QR off). */
export function ClosedNotice({ reason }: { reason: TableClosedReason }) {
  const { t } = useT()
  const text = CLOSED_TEXT[reason]
  return (
    <div role="status" className="card mx-4 mt-3 flex gap-3 p-4 text-ink">
      <Icon name={text.icon} className="mt-1 size-7 shrink-0 text-accent" />
      <div>
        <p className="font-bold text-accent">{t(text.title)}</p>
        <p>{t(text.body)}</p>
      </div>
    </div>
  )
}
