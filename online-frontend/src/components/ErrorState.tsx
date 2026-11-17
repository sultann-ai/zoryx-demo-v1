import { ApiError, friendlyErrorKey } from '../api/client'
import { SHOP_PHONE, phoneHref } from '../lib/config'
import { useIsPhone } from '../lib/useAppMode'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { AppState } from './mobile/AppState'
import { Button, ButtonLink } from './ui/Button'

/**
 * Friendly failure: plain words, a retry, and a number to call. On phones it is a full-screen state; with no connection
 * it says so and that the order is kept on the phone.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useT()
  const phone = useIsPhone()
  if (phone) {
    const offline = (error instanceof ApiError && error.status === 0) || !navigator.onLine
    return (
      <AppState
        role="alert"
        tone="warning"
        icon={offline ? 'wifi-off' : 'alert'}
        title={t(offline ? 'state.offlineTitle' : 'state.errorTitle')}
        body={offline ? t('state.offlineBody') : t(friendlyErrorKey(error))}
      >
        {onRetry && (
          <Button onClick={onRetry}>
            <Icon name="repeat" />
            <span>{t('err.retry')}</span>
          </Button>
        )}
        <ButtonLink href={phoneHref(SHOP_PHONE)} variant="secondary" className="text-ink">
          <Icon name="phone" />
          <span dir="ltr">{SHOP_PHONE}</span>
        </ButtonLink>
      </AppState>
    )
  }
  return (
    <div role="alert" className="mx-auto max-w-md space-y-4 px-4 py-10 text-center">
      <p className="flex items-start justify-center gap-2 text-error">
        <Icon name="alert" className="mt-2 size-6" />
        <span>{t(friendlyErrorKey(error))}</span>
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {onRetry && <Button onClick={onRetry}>{t('err.retry')}</Button>}
        <ButtonLink href={phoneHref(SHOP_PHONE)} variant="secondary" className="text-ink">
          <Icon name="phone" />
          <span dir="ltr">{SHOP_PHONE}</span>
        </ButtonLink>
      </div>
    </div>
  )
}
