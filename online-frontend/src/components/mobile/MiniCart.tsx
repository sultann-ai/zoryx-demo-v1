import { useEffect } from 'react'
import { useCart } from '../../cart/context'
import { useCartBump } from '../../cart/useCartBump'
import { useResolvedCart } from '../../cart/pricing'
import { formatRs } from '../../lib/format'
import { setCartPanel } from '../../lib/cartPanel'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

function Pill({ count, bump }: { count: number; bump: number }) {
  const { t } = useT()
  const { ready, total } = useResolvedCart()

  return (
    <button
      type="button"
      onClick={() => setCartPanel('cart')}
      aria-haspopup="dialog"
      className="minicart pointer-events-auto flex h-14 w-full items-center justify-between gap-2 rounded-full bg-action px-4 text-on-action shadow-soft transition-colors hover:bg-action-hover"
    >
      <span key={bump} className={`flex min-w-0 items-center gap-2 whitespace-nowrap font-bold ${bump > 0 ? 'pop' : ''}`}>
        <span dir="ltr">{count}</span>
        <span className="font-normal max-[359px]:hidden">{count === 1 ? t('cart.itemOne') : t('cart.itemMany')}</span>
        <span aria-hidden="true">·</span>
        <span dir="ltr">{ready ? formatRs(total) : '…'}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-bold">
        <span>{t('cart.viewOrder')}</span>
        <Icon name="arrow" mirror className="size-5" />
      </span>
    </button>
  )
}

/**
 * The phone mini-cart: a floating pill above the tab bar ("3 items · Rs 1,450 · View order") while the cart has
 * anything in it. It opens the full-screen cart; its numbers pop when something is added. While it shows, the page gets
 * room under its content (--minicart-h) so the last card is never behind it.
 */
export function MiniCart({ hidden }: { hidden: boolean }) {
  const { count } = useCart()
  const bump = useCartBump()
  const visible = count > 0 && !hidden
  useEffect(() => {
    if (!visible) return
    const root = document.documentElement
    root.style.setProperty('--minicart-h', '4.5rem')
    return () => {
      root.style.removeProperty('--minicart-h')
    }
  }, [visible])
  if (!visible) return null
  return (
    <div className="minicart pointer-events-none fixed inset-x-3 bottom-[calc(var(--tabbar-h)+0.75rem)] z-30 mx-auto max-w-xl pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <Pill count={count} bump={bump} />
    </div>
  )
}
