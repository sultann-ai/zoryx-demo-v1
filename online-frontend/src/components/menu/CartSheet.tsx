import { useStore } from '../../api/store'
import { useCart } from '../../cart/context'
import { useResolvedCart } from '../../cart/pricing'
import { formatRs } from '../../lib/format'
import { useIsPhone } from '../../lib/useAppMode'
import { pick } from '../../lib/localized'
import { useT } from '../../i18n'
import { Fill } from '../Fill'
import { Icon } from '../Icon'
import { Sheet } from '../Sheet'
import { buttonClass } from '../ui/buttonClass'
import { QuantityStepper } from '../ui/QuantityStepper'
import { UndoToast } from '../UndoToast'
import { AppState } from '../mobile/AppState'
import { SwipeRow } from '../mobile/SwipeRow'
import { Button } from '../ui/Button'
import { Photo } from './Photo'

export function CartSheet({ closed, onClose, onContinue }: { closed: boolean; onClose: () => void; onContinue: () => void }) {
  const { t, lang } = useT()
  const cart = useCart()
  const phone = useIsPhone() // phones: a full-screen page with swipe-to-remove rows and a "Checkout" button
  const { lines, total } = useResolvedCart()
  const areas = useStore().data?.deliveryAreas ?? []
  const lowestFee = areas.length
    ? Math.min(...areas.map((a) => Number.parseFloat(a.deliveryFee)).filter(Number.isFinite))
    : null

  return (
    <Sheet
      title={t('cart.title')}
      onClose={onClose}
      fullscreen={phone}
      page={phone}
      footer={
        <div className="space-y-3">
          {/* Subtotal card with the delivery-fee note under it */}
          <div className="space-y-1 rounded-card bg-canvas p-4">
            <div className="flex items-center justify-between text-xl font-bold">
              <span>{t('cart.subtotal')}</span>
              <span dir="ltr" className="text-ink">
                {formatRs(total)}
              </span>
            </div>
            {lowestFee !== null && Number.isFinite(lowestFee) && (
              <p className="text-sm text-muted">
                <Fill text={t('cart.deliveryFrom')} values={{ price: formatRs(lowestFee) }} />
              </p>
            )}
            <p className="text-sm text-muted">{t('cart.checkoutNote')}</p>
          </div>
          {closed && <p className="text-base font-bold text-accent">{t('cart.closedHint')}</p>}
          <button
            type="button"
            disabled={closed || lines.length === 0}
            onClick={onContinue}
            className={`${buttonClass('primary', 'lg', 'w-full')} disabled:opacity-40`}
          >
            <span>{phone ? t('cart.checkout') : t('cart.continue')}</span>
            <Icon name="arrow" mirror />
          </button>
          {!phone && <UndoToast announce className="justify-between" />}
        </div>
      }
    >
      {lines.length === 0 ? (
        phone ? (
          <AppState icon="cart" compact title={t('cart.empty')}>
            <Button onClick={onClose}>{t('footer.menu')}</Button>
          </AppState>
        ) : (
          <p className="py-8 text-center text-xl">{t('cart.empty')}</p>
        )
      ) : (
        <ul className="space-y-3">
          {lines.map((l) => {
            const name = pick(lang, l.name, l.nameUr) ?? l.name
            const row = (
              <div className={`flex gap-3 p-2 ${phone ? '' : 'card'}`}>
                <Photo src={l.image?.thumb} alt={name} width={96} height={72} className="w-24 shrink-0 self-start overflow-hidden rounded-inner" contain={l.image?.hasTransparency} />
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-bold leading-snug text-ink">{name}</p>
                  {l.variantLabel && <p className="text-sm text-muted">{l.variantLabel}</p>}
                  {l.addOns.length > 0 && <p className="text-sm text-muted">+ {l.addOns.map((a) => a.name).join('، ')}</p>}
                  <p dir="ltr" className="text-start font-bold text-ink">
                    {formatRs(l.total)}
                  </p>
                  <QuantityStepper value={l.line.qty} min={0} onChange={(next) => cart.setQty(l.key, next)} />
                </div>
              </div>
            )
            return <li key={l.key}>{phone ? <SwipeRow onRemove={() => cart.setQty(l.key, 0)}>{row}</SwipeRow> : row}</li>
          })}
        </ul>
      )}
    </Sheet>
  )
}
