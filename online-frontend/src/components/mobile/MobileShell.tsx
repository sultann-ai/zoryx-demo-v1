import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { directionFor, isIOS, navigateWithTransition, navigationCommitted, type NavDirection } from '../../lib/navTransition'
import { TAB_ROOTS, useScrollMemory } from '../../lib/scrollMemory'
import { useThemeColor } from '../../lib/useThemeColor'
import { useTyping } from '../../lib/useTyping'
import { useT, type TranslationKey } from '../../i18n'
import { OfflineBanner } from '../OfflineBanner'
import { Splash } from './AppState'
import { PageToasts } from './ToastHost'
import { AppBar } from './AppBar'
import { CartHost } from './CartHost'
import { CartToasts } from './CartToasts'
import { MiniCart } from './MiniCart'
import { TabBar } from './TabBar'

// Screens with a large title under the app bar; it collapses into the bar's small title on scroll.
const largeTitles: Record<string, TranslationKey> = {
  '/menu': 'nav.menu',
  '/more': 'more.title',
}

function smallTitleKey(pathname: string): TranslationKey | null {
  if (pathname === '/') return null
  if (largeTitles[pathname]) return largeTitles[pathname]
  if (pathname === '/orders' || pathname.startsWith('/order/')) return 'orders.title'
  return 'brand.name'
}

/** The large title: a sentinel for the app bar. Reports whether it is still on screen below the bar. */
function LargeTitle({ text, onVisible }: { text: string; onVisible: (visible: boolean) => void }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const bar = document.getElementById('appbar')?.offsetHeight ?? 56
    const observer = new IntersectionObserver(([entry]) => onVisible(entry.isIntersecting), { rootMargin: `-${bar}px 0px 0px 0px` })
    observer.observe(el)
    return () => observer.disconnect()
  }, [onVisible])
  // The Menu page has its own <h1>; this one is the visual title only.
  return (
    <p ref={ref} aria-hidden="true" className="px-4 pb-1 pt-3 font-serif text-3xl font-bold leading-tight text-ink">
      {text}
    </p>
  )
}

/**
 * The phone shell (< 768px): fixed app bar on top, fixed tab bar at the bottom, the same routes in between.
 * Owns the phone-only behaviour: page transitions, per-tab scroll memory, link interception (so a navigation can run
 * inside a view transition), and hiding the tab bar while a field has the keyboard.
 */
export function MobileShell() {
  const { t } = useT()
  const { pathname, search, key } = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const mainRef = useRef<HTMLElement>(null)
  const typing = useTyping()
  const [largeVisible, setLargeVisible] = useState(true)

  useScrollMemory()
  useThemeColor('--color-canvas')

  const latest = useRef({ pathname, search, navigate })
  useEffect(() => {
    latest.current = { pathname, search, navigate }
  })

  // Route has changed: release a waiting view transition, or play the CSS enter animation where there is none.
  const shownKey = useRef(key)
  useLayoutEffect(() => {
    navigationCommitted()
    if (shownKey.current === key) return // first paint (also the dev double-run): nothing to animate
    shownKey.current = key
    const root = document.documentElement
    const main = mainRef.current
    if (!main || 'vt' in root.dataset) return
    const fromBack = navigationType === 'POP'
    if (fromBack && isIOS()) return // Safari has just played its own swipe-back animation
    const direction: NavDirection = (root.dataset.nav as NavDirection | undefined) ?? (fromBack ? 'back' : 'tab')
    delete root.dataset.nav
    delete main.dataset.enter
    void main.offsetWidth // restart the animation
    main.dataset.enter = direction
  }, [key, navigationType])

  // Every internal link goes through here so the navigation can run inside a view transition.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download') || link.origin !== window.location.origin) return
      const current = latest.current
      if (link.pathname === current.pathname && link.search === current.search) return // same page: the router scrolls to the hash
      event.preventDefault()
      event.stopPropagation()
      const to = `${link.pathname}${link.search}${link.hash}`
      navigateWithTransition(directionFor(current.pathname, link.pathname, TAB_ROOTS), () => current.navigate(to))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  const large = largeTitles[pathname]
  const smallKey = smallTitleKey(pathname)
  // Inner screens (anything that is not a tab root) get a back button. Orders opened from the tab is a tab screen too.
  const isTabRoot = (TAB_ROOTS as readonly string[]).includes(pathname)
  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
    if (idx > 0) navigateWithTransition('back', () => navigate(-1), true)
    else navigateWithTransition('back', () => navigate('/', { replace: true }))
  }

  return (
    <div className="app-shell min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded-inner focus:bg-ink focus:px-4 focus:py-2 focus:font-bold focus:text-on-action"
      >
        {t('nav.skip')}
      </a>
      <AppBar
        title={smallKey ? t(smallKey) : null}
        showTitle={!large || !largeVisible}
        onBack={isTabRoot ? undefined : goBack}
      />
      <OfflineBanner />
      <main
        id="main"
        ref={mainRef}
        className="page-enter min-h-dvh pb-[calc(var(--tabbar-h)+var(--minicart-h,0px))] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[var(--header-h)]"
      >
        {large && <LargeTitle key={pathname} text={t(large)} onVisible={setLargeVisible} />}
        <Suspense fallback={<Splash />}>
          <Outlet />
        </Suspense>
      </main>
      <MiniCart hidden={typing || (pathname !== '/' && pathname !== '/menu')} />
      <TabBar hidden={typing} />
      <PageToasts />
      <CartToasts />
      <CartHost />
    </div>
  )
}
