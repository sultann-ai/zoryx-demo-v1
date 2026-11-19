import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError } from '../api/client'
import { useReceipt } from '../api/table'
import { Logo } from '../brand/Logo'
import { useShopName } from '../brand/useShopName'
import { LanguageToggle } from '../components/LanguageToggle'
import { AppState } from '../components/mobile/AppState'
import { PageToasts } from '../components/mobile/ToastHost'
import { ReceiptView } from '../components/receipt/ReceiptView'
import { Skeleton } from '../components/Skeleton'
import { Button } from '../components/ui/Button'
import { Icon } from '../components/Icon'
import { useThemeColor } from '../lib/useThemeColor'
import { useT } from '../i18n'

const KEY = /^[A-Za-z0-9_-]{43}$/

/**
 * /r/:receiptKey — a table's receipt behind its long random link: public, works after the table is closed, the
 * same for every guest. Its own slim frame (logo, language toggle), no website header or tab bar; prints clean.
 */
export default function Receipt() {
  const { t } = useT()
  const shop = useShopName()
  const { receiptKey = '' } = useParams()
  const valid = KEY.test(receiptKey)
  const receipt = useReceipt(valid ? receiptKey : null)
  useThemeColor('--color-canvas')

  useEffect(() => {
    document.title = `${t('receipt.title')} · ${shop}`
  }, [t, shop])

  const missing = !valid || (receipt.error instanceof ApiError && receipt.error.status === 404)

  return (
    <div className="app-shell min-h-dvh bg-canvas">
      <header className="no-print flex h-[56px] items-center justify-between gap-2 px-4 pt-[env(safe-area-inset-top)]">
        <Logo className="text-xl" />
        <LanguageToggle />
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 pb-10 pt-2">
        {missing ? (
          <AppState icon="receipt" title={t('receipt.notFound')} body={t('receipt.notFoundBody')} />
        ) : receipt.isPending ? (
          <div role="status" className="mx-auto max-w-md space-y-3 pt-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : receipt.isError ? (
          <AppState icon="alert" tone="warning" title={t('state.errorTitle')} body={t('err.generic')}>
            <Button onClick={() => void receipt.refetch()}>
              <Icon name="repeat" />
              <span>{t('err.retry')}</span>
            </Button>
          </AppState>
        ) : (
          <ReceiptView receipt={receipt.data} receiptKey={receiptKey} />
        )}
      </main>
      <PageToasts />
    </div>
  )
}
