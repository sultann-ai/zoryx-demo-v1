import { useCart } from '../../cart/context'
import { useResolvedCart } from '../../cart/pricing'
import { formatRs } from '../../lib/format'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Button } from '../ui/Button'

/**
 * A floating orange pill while the cart has anything in it: item item count over the estimated total on one side, "View my order" on
 * the other. The whole pill is the one button (a 56px target).
 */
export function CartBar({ onView }: { onView: () => void }) {
  const { t } = useT()
  const { count } = useCart()
  const { ready, total } = useResolvedCart()
  if (count === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-30 mx-auto max-w-xl max-md:hidden">
      <Button onClick={onView} className="pointer-events-auto w-full !min-h-14 !justify-between !px-5 shadow-soft max-[359px]:!px-4">
        <span className="min-w-0 whitespace-nowrap text-start leading-snug">
          <span className="block text-sm font-normal">
            <span dir="ltr">{count}</span> {count === 1 ? t('cart.itemOne') : t('cart.itemMany')}
          </span>
          <span dir="ltr" className="block font-bold">
            {ready ? formatRs(total) : '…'}
          </span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap">
          <span>{t('cart.view')}</span>
          <Icon name="arrow" mirror className="size-6" />
        </span>
      </Button>
    </div>
  )
}
