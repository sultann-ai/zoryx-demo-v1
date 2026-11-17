import { MAX_QTY } from '../../cart/types'
import { useT } from '../../i18n'
import { Icon } from '../Icon'

/** "- 1 +" with round 48px buttons. Going below `min` calls onChange(min - 1) so callers can remove the line. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  compact = false,
  noIncrease = false,
  className = '',
}: {
  value: number
  onChange: (next: number) => void
  min?: number
  /** Tighter spacing so the whole control fits inside a 2-column phone card (buttons stay 48px). */
  compact?: boolean
  /** Ordering is closed: lines already in the order can go down or away, but nothing more can be added. */
  noIncrease?: boolean
  className?: string
}) {
  const { t } = useT()
  const button =
    'flex size-tap shrink-0 items-center justify-center rounded-full bg-action text-on-action transition-transform motion-safe:active:scale-95 disabled:opacity-40 hover:bg-action-hover'
  return (
    <div className={`flex items-center justify-between ${compact ? 'gap-0.5' : 'gap-2'} ${className}`}>
      <button type="button" className={button} aria-label={t('cart.less')} onClick={() => onChange(value - 1)} disabled={value <= min}>
        <Icon name="minus" />
      </button>
      <span dir="ltr" className={`${compact ? 'min-w-6' : 'min-w-8'} text-center text-xl font-bold`} aria-live="polite">
        {value}
      </span>
      <button type="button" className={button} aria-label={t('cart.more')} onClick={() => onChange(value + 1)} disabled={value >= MAX_QTY || noIncrease}>
        <Icon name="plus" />
      </button>
    </div>
  )
}
