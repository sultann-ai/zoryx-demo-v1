import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Logo, LogoMark } from '../brand/Logo'
import { useCart } from '../cart/context'
import { phoneHref } from '../lib/config'
import { HOME_HERO_TONE } from '../lib/heroTone'
import { useShopPhone } from '../lib/useShopPhone'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { LanguageToggle } from './LanguageToggle'
import { ButtonRoute } from './ui/Button'

/** Scrolled past this many px, the header turns solid (cream, hairline border, soft shadow). */
const SOLID_AFTER = 24

const navLink = 'nav-link inline-flex min-h-touch min-w-tap items-center justify-center px-1 text-lg'

/** True once the page has scrolled past SOLID_AFTER. One passive listener, at most one update per frame. */
function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(() => typeof window !== 'undefined' && window.scrollY > px)
  useEffect(() => {
    let frame = 0
    const check = () => {
      frame = 0
      setPast(window.scrollY > px)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check)
    }
    check()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [px])
  return past
}

/**
 * The website header (768px and up; phones use the app bar). Sticky. At the top of the page it is transparent; past
 * 24px of scroll it turns cream with a hairline bottom border and the soft shadow (200ms, --dur-header).
 * Over a dark Home hero (HOME_HERO_TONE) and not yet scrolled, it takes the hero's forest (so the green runs up to the
 * top edge) and carries .tone-dark: reversed logo, cream nav and icons, lime "Order now". Solid, it is the primary logo
 * and the light colours.
 * Logo left, centred text nav, round icon buttons (language, call, cart with its count) and "Order now" on the right.
 */
export function Header() {
  const { t } = useT()
  const { count } = useCart()
  const phone = useShopPhone()
  const { pathname } = useLocation()
  const solid = useScrolledPast(SOLID_AFTER)
  const dark = !solid && pathname === '/' && HOME_HERO_TONE === 'dark'
  // The menu and order pages already have their own one big action.
  const showOrder = !pathname.startsWith('/menu') && !pathname.startsWith('/order')
  const logoVariant = dark ? 'reversed' : 'primary'

  return (
    <header
      className={`sticky top-0 z-30 h-16 border-b transition-[background-color,border-color,box-shadow] duration-[var(--dur-header)] ease-[var(--ease-out)] ${
        solid ? 'border-ink/10 bg-canvas shadow-soft' : `border-transparent shadow-none ${dark ? 'bg-forest' : 'bg-transparent'}`
      } ${dark ? 'tone-dark' : ''}`}
    >
      <div className="mx-auto flex h-full max-w-page-padded items-center gap-2 px-gutter lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-6">
        {/* The full lockup needs 100px; in less room (a container query on the link) only the mark shows. Never stretched,
            never shadowed: the logo keeps its own proportions at every size. */}
        <Link to="/" aria-label={t('brand.name')} className="@container flex min-h-tap min-w-0 flex-1 items-center">
          <Logo variant={logoVariant} className="text-xl @max-[100px]:hidden md:text-2xl" />
          <LogoMark variant={logoVariant} className="hidden size-10 @max-[100px]:block" />
        </Link>

        <nav aria-label={t('nav.main')} className="hidden items-center gap-8 lg:flex">
          <NavLink to="/" end className={navLink}>
            {t('nav.home')}
          </NavLink>
          <NavLink to="/menu" className={navLink}>
            {t('nav.menu')}
          </NavLink>
          <Link to={{ pathname: '/', hash: '#find' }} className={navLink}>
            {t('nav.find')}
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2 lg:justify-end">
          <LanguageToggle className="icon-btn whitespace-nowrap px-3 text-base font-bold leading-none" />
          <a href={phoneHref(phone)} aria-label={`${t('contact.call')} ${phone}`} className="icon-btn max-md:hidden">
            <Icon name="phone" />
          </a>
          <Link to="/menu" aria-label={`${t('nav.cart')}${count > 0 ? ` (${count})` : ''}`} className="icon-btn">
            <Icon name="cart" />
            {count > 0 && (
              // Lime with ink text (10.6:1); the ink ring gives it an edge on the light header, where lime alone has none.
              <span
                aria-hidden="true"
                dir="ltr"
                className="num absolute -end-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-promo px-1 text-sm leading-none text-ink ring-2 ring-ink"
              >
                {count}
              </span>
            )}
          </Link>
          {showOrder && (
            // Under 400px the label is visually hidden (still the button's name) and the button becomes a round bag icon:
            // same element, same link.
            <ButtonRoute to="/menu" className="max-[400px]:!size-tap max-[400px]:!min-h-0 max-[400px]:!p-0">
              <Icon name="bag" className="size-6" />
              <span className="whitespace-nowrap max-[400px]:sr-only">{t('nav.orderNow')}</span>
            </ButtonRoute>
          )}
        </div>
      </div>
    </header>
  )
}
