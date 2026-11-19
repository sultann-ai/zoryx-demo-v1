import { Suspense, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { TableInfo } from '../../api/table'
import { useShopName } from '../../brand/useShopName'
import { AppBar } from '../../components/mobile/AppBar'
import { Splash } from '../../components/mobile/AppState'
import { CartToasts } from '../../components/mobile/CartToasts'
import { MiniCart } from '../../components/mobile/MiniCart'
import { CartTab, Tab } from '../../components/mobile/TabBar'
import { PageToasts } from '../../components/mobile/ToastHost'
import { OfflineBanner } from '../../components/OfflineBanner'
import { useThemeColor } from '../../lib/useThemeColor'
import { useTyping } from '../../lib/useTyping'
import { useT } from '../../i18n'
import { tableLabel, tablePath } from './TableContext'

/** The joined guest's tabs: Home (the table), Menu, Cart (opens the cart sheet), Table (everything ordered so far). */
function TableTabs({ qrKey, hidden }: { qrKey: string; hidden: boolean }) {
  const { t } = useT()
  const { pathname } = useLocation()
  const home = tablePath(qrKey)
  return (
    <nav
      aria-label={t('nav.tabs')}
      hidden={hidden}
      className="tabbar fixed inset-x-0 bottom-0 z-30 bg-surface/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur"
    >
      <div className="mx-auto grid h-[56px] max-w-xl grid-cols-[1fr_1fr_1.35fr_1fr] border-t border-ink/10">
        <Tab to={home} icon="home" label="nav.home" active={pathname === home || pathname === `${home}/`} />
        <Tab to={tablePath(qrKey, 'menu')} icon="list" label="nav.menu" active={pathname === tablePath(qrKey, 'menu')} />
        <CartTab />
        <Tab to={tablePath(qrKey, 'table')} icon="users" label="table.tab" active={pathname === tablePath(qrKey, 'table')} />
      </div>
      <div className="h-[var(--sab)]" aria-hidden="true" />
    </nav>
  )
}

/**
 * The slim frame of every /t/* screen: the app bar (shop name over the table name, the language toggle; no call
 * button and no website header, footer or WhatsApp), the offline banner, and once the guest has joined, the tab bar
 * and the mini-cart pill. The phone layout at every width (index.css `.table-shell`).
 */
export function TableShell({
  qrKey,
  table,
  joined = false,
  children,
}: {
  qrKey: string
  /** Null while the table is still loading. */
  table: TableInfo | null
  joined?: boolean
  children: ReactNode
}) {
  const { t } = useT()
  const shop = useShopName()
  const typing = useTyping()
  const { pathname } = useLocation()
  useThemeColor('--color-canvas')

  return (
    <div className="table-shell app-shell min-h-dvh" data-tabs={joined ? '' : undefined}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-inner focus:bg-ink focus:px-4 focus:py-2 focus:font-bold focus:text-on-action"
      >
        {t('nav.skip')}
      </a>
      <AppBar
        call={false}
        showTitle
        title={
          <>
            <span className="block truncate font-sans text-sm font-normal text-muted">{shop}</span>
            <span className="block truncate">{table ? tableLabel(table) : t('table.title')}</span>
          </>
        }
      />
      <div className="no-print fixed inset-x-0 top-[var(--header-h)] z-20">
        <OfflineBanner message={t('table.offline')} className="text-base" />
      </div>
      <main
        id="main"
        className="mx-auto min-h-dvh max-w-3xl pb-[calc(var(--tabbar-h,0px)+var(--minicart-h,0px))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[var(--header-h)]"
      >
        <Suspense fallback={<Splash />}>{children}</Suspense>
      </main>
      {joined && (
        <>
          <MiniCart hidden={typing || pathname !== tablePath(qrKey, 'menu')} />
          <TableTabs qrKey={qrKey} hidden={typing} />
          <CartToasts />
        </>
      )}
      <PageToasts />
    </div>
  )
}
