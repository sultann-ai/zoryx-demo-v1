import { useEffect } from 'react'
import { useCart } from '../cart/context'
import { useT } from '../i18n'

/**
 * Short "Removed - Undo" toast. Rendered both on the page and inside the cart sheet, because a modal dialog sits in
 * the top layer and hides anything outside it. Only one of the two announces itself to screen readers.
 */
export function UndoToast({ announce = false, className = '' }: { announce?: boolean; className?: string }) {
  const { t } = useT()
  const { removed, undoRemove, dismissRemoved } = useCart()

  useEffect(() => {
    if (!removed) return
    const timer = setTimeout(dismissRemoved, 6000)
    return () => clearTimeout(timer)
  }, [removed, dismissRemoved])

  if (!removed) return null
  return (
    <div
      role={announce ? 'status' : undefined}
      className={`tone-dark flex items-center justify-between gap-3 rounded-full bg-ink px-5 py-1 text-on-action shadow-soft ${className}`}
    >
      <span>{t('cart.removed')}</span>
      <button type="button" onClick={undoRemove} className="min-h-touch px-2 font-bold text-promo underline">
        {t('cart.undo')}
      </button>
    </div>
  )
}
