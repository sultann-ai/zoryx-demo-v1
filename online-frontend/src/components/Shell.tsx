import { lazy, Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useT, type TranslationKey } from '../i18n'
import { useIsPhone, useStandalone } from '../lib/useAppMode'
import '../lib/useInstall' // captures beforeinstallprompt as early as possible
import { Footer } from './Footer'
import { Header } from './Header'
import { OfflineBanner } from './OfflineBanner'
import { PageSkeleton } from './Skeleton'
import { Splash } from './mobile/AppState'
import { PageToasts } from './mobile/ToastHost'
import { WhatsAppButton } from './WhatsAppButton'

// Below 768px the website header/footer are replaced by the app shell (app bar + tab bar); its code loads only there.
const loadMobileShell = () => import('./mobile/MobileShell').then((m) => ({ default: m.MobileShell }))
const MobileShell = lazy(loadMobileShell)
// On a phone start fetching it right away, in parallel with the page's own chunks, so the shell does not pop in late.
if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches) void loadMobileShell()

function titleKey(pathname: string): TranslationKey {
  if (pathname === '/') return 'page.home'
  if (pathname === '/menu') return 'page.menu'
  if (pathname === '/more') return 'page.more'
  if (pathname === '/orders') return 'page.orders'
  if (pathname.startsWith('/order/')) return 'page.order'
  return 'page.notFound'
}

function DesktopShell() {
  const { t } = useT()
  const { pathname, hash } = useLocation()

  useEffect(() => {
    // A link to a section (/#find, /menu#sec-...) scrolls to it itself (see useScrollToHash).
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <div className="flex min-h-svh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-inner focus:bg-ink focus:px-4 focus:py-2 focus:font-bold focus:text-on-action"
      >
        {t('nav.skip')}
      </a>
      <OfflineBanner />
      <Header />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      <Footer />
      <WhatsAppButton />
      <PageToasts />
    </div>
  )
}

export function Shell() {
  const { t } = useT()
  const { pathname } = useLocation()
  const phone = useIsPhone()
  const standalone = useStandalone()

  useEffect(() => {
    document.title = t(titleKey(pathname))
  }, [pathname, t])

  // CSS hooks: installed mode adjusts spacing and hides install prompts.
  useEffect(() => {
    const root = document.documentElement
    if (standalone) root.dataset.standalone = ''
    else delete root.dataset.standalone
  }, [standalone])

  return phone ? (
    <Suspense fallback={<Splash />}>
      <MobileShell />
    </Suspense>
  ) : (
    <DesktopShell />
  )
}
