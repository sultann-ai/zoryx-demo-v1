import { Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { isFinalStatus, useOrderStatus } from '../../api/orders'
import { useCart } from '../../cart/context'
import { useCartBump } from '../../cart/useCartBump'
import { useResolvedCart } from '../../cart/pricing'
import { formatRs } from '../../lib/format'
import { useFreshOrderId } from '../../lib/orderHistory'
import { setCartPanel } from '../../lib/cartPanel'
import { useT, type TranslationKey } from '../../i18n'
import { Icon, type IconName } from '../Icon'

const tabClass = 'tab-item relative flex min-w-0 flex-col items-center justify-start pt-[3px] text-center'

function Tab({ to, icon, label, active, badge }: { to: string; icon: IconName; label: TranslationKey; active: boolean; badge?: ReactNode }) {
  const { t } = useT()
  return (
    <Link to={to} aria-current={active ? 'page' : undefined} className={`${tabClass} ${active ? 'font-bold text-ink' : 'text-muted'}`}>
      <span className={`flex h-[24px] w-12 items-center justify-center rounded-full transition-colors ${active ? 'bg-action text-on-action' : ''}`}>
        <Icon name={icon} className="size-[22px]" />
        {badge}
      </span>
      <span className="tab-label max-w-full truncate">{t(label)}</span>
    </Link>
  )
}

/** A dot on the Orders tab while the newest recent order is in progress (it polls its status like the Orders screen does). */
function OrderDot() {
  const { t } = useT()
  const id = useFreshOrderId()
  if (!id) return null
  return <ActiveDot publicId={id} label={t('orders.inProgress')} />
}

function ActiveDot({ publicId, label }: { publicId: string; label: string }) {
  const { data } = useOrderStatus(publicId)
  if (!data || isFinalStatus(data.status)) return null
  return (
    <span className="absolute -top-0.5 end-1 flex size-3 items-center justify-center rounded-full bg-accent ring-2 ring-surface">
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** The cart total shows only when something is in the cart, so an empty cart never loads the menu on other tabs. */
function CartTotal() {
  const { ready, total } = useResolvedCart()
  return (
    <span dir="ltr" className="tab-label max-w-full whitespace-nowrap font-bold text-ink">
      {ready ? formatRs(total) : '…'}
    </span>
  )
}

/**
 * Bottom tab bar (phones): Home, Menu, Cart, Orders, More. 56px plus the home-indicator inset. A <nav>; the current
 * tab carries aria-current. Tabs sit in DOM order, so right-to-left mirrors them with no extra code. The Cart tab is
 * a button (it opens the cart sheet, not a page) with a live count badge and, once there is something in it, the total.
 */
export function TabBar({ hidden }: { hidden: boolean }) {
  const { t } = useT()
  const { count } = useCart()
  const bump = useCartBump()
  const { pathname } = useLocation()
  const ordersActive = pathname === '/orders' || pathname.startsWith('/order/')

  return (
    <nav
      aria-label={t('nav.tabs')}
      hidden={hidden}
      className="tabbar fixed inset-x-0 bottom-0 z-30 bg-surface/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur"
    >
      <div className="grid h-[56px] border-t border-ink/10 grid-cols-[1fr_1fr_1.35fr_1fr_1fr]">
        <Tab to="/" icon="home" label="nav.home" active={pathname === '/'} />
        <Tab to="/menu" icon="list" label="nav.menu" active={pathname === '/menu'} />
        <button
          type="button"
          onClick={() => setCartPanel('cart')}
          aria-haspopup="dialog"
          aria-label={`${t('nav.cart')}${count > 0 ? ` (${count})` : ''}`}
          className={`${tabClass} text-muted`}
        >
          <span key={bump} className={`relative flex h-[24px] w-12 items-center justify-center ${bump > 0 ? 'pop' : ''}`}>
            <Icon name="cart" className="size-[22px]" />
            {count > 0 && (
              <span
                dir="ltr"
                className="absolute -top-1 end-0 flex min-w-5 items-center justify-center rounded-full bg-action px-1 text-sm font-bold leading-5 text-on-action"
              >
                {count}
              </span>
            )}
          </span>
          {count > 0 ? <CartTotal /> : <span className="tab-label max-w-full truncate">{t('nav.cartTab')}</span>}
        </button>
        <Tab to="/orders" icon="receipt" label="nav.orders" active={ordersActive} badge={<OrderDot />} />
        <Tab to="/more" icon="more" label="nav.more" active={pathname === '/more'} />
      </div>
      <div className="h-[var(--sab)]" aria-hidden="true" />
    </nav>
  )
}
