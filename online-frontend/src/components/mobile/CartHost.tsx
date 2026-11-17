import { lazy, Suspense, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useStore } from '../../api/store'
import { usePruneCart } from '../../cart/pricing'
import { setCartPanel, useCartPanel } from '../../lib/cartPanel'
import { useHistoryLayer } from '../../lib/useHistoryLayer'
// Both sheets load only when the cart is opened.
const CartSheet = lazy(() => import('../menu/CartSheet').then((m) => ({ default: m.CartSheet })))

// Same lazy chunk the Menu page uses on wider screens.
const CheckoutSheet = lazy(() => import('../checkout/CheckoutSheet').then((m) => ({ default: m.CheckoutSheet })))

function OpenCart({ phase }: { phase: 'cart' | 'checkout' }) {
  const store = useStore()
  usePruneCart()
  const closed = store.data ? !store.data.orderingOpen : false
  const close = () => setCartPanel('closed')
  return (
    <Suspense fallback={null}>
      {phase === 'cart' ? <CartSheet closed={closed} onClose={close} onContinue={() => setCartPanel('checkout')} /> : <CheckoutSheet onClose={close} />}
    </Suspense>
  )
}

/** Phone shell: the cart and checkout sheets, opened by the Cart tab from any page; Back closes them. */
export function CartHost() {
  const phase = useCartPanel()
  const { pathname } = useLocation()
  useHistoryLayer(phase !== 'closed', () => setCartPanel('closed'))
  // Placing an order navigates to its page: the sheet goes with the route.
  useEffect(() => {
    setCartPanel('closed')
  }, [pathname])
  return phase === 'closed' ? null : <OpenCart phase={phase} />
}
