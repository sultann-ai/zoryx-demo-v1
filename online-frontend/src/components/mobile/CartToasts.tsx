import { useEffect } from 'react'
import { useCart } from '../../cart/context'
import { useT } from '../../i18n'
import { showToast } from '../../lib/toast'

/** Cart removals become a snackbar with Undo (the cart keeps the removed line until the snackbar goes away). Also in the table QR shell. */
export function CartToasts() {
  const { t } = useT()
  const { removed, undoRemove, dismissRemoved } = useCart()
  useEffect(() => {
    if (!removed) return
    showToast({ message: t('cart.removed'), action: { label: t('cart.undo'), run: undoRemove }, onClose: dismissRemoved })
    // only a new removal should raise a toast
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removed])
  return null
}
