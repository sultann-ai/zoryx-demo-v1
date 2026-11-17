import { useEffect, useState, type ReactNode } from 'react'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Photo } from '../menu/Photo'
import { Badge } from './Badge'
import { Button } from './Button'
import { Card } from './Card'
import { PriceTag } from './PriceTag'
import { QuantityStepper } from './QuantityStepper'

export interface ProductPhoto {
  src: string | null | undefined
  /** A cut-out (transparent background): shown whole (object-contain) instead of cropped to fill. */
  hasTransparency?: boolean
}

/** The one order badges appear in, on every card: Popular, then New, then Deal. */
const BADGE_ORDER = ['popular', 'new', 'deal'] as const

/** How long the add button shows its check before the stepper takes its place (the cart itself is updated at once). */
const ADDED_MS = 600

/**
 * The one menu / deal / popular card: white, 20px, resting shadow and a hairline ink border. A 4:3 photo (or the designed
 * placeholder) with the badges in their fixed order on top, the name (DM Sans 700, two lines at most), a one-line
 * description, the price bottom-start and a 44px round forest "+" bottom-end that becomes a stepper once added.
 * Pointer devices: the card lifts with the raised shadow and the photo grows to 1.04 inside its frame. Keyboard focus
 * anywhere inside rings the whole card. No ratings, review counts, hearts or time claims: we have none of that data.
 */
export function ProductCard({
  name,
  description,
  photo,
  badges = [],
  price,
  extra,
  qty = 0,
  onAdd,
  onQtyChange,
  confirmAdd = true,
  disabled = false,
  inOrder = 0,
  action,
  priority = false,
  as = 'li',
}: {
  name: string
  description?: string | null
  photo: ProductPhoto
  badges?: ('popular' | 'new' | 'deal')[]
  /** Omit for an item that has no price to show (e.g. ask-the-shop items). */
  price?: { amount: string | number; from?: boolean } | null
  /** Anything under the description (a deal's contents). */
  extra?: ReactNode
  /** How many are in the cart as a single plain line; > 0 swaps the "+" for a stepper. */
  qty?: number
  onAdd?: () => void
  onQtyChange?: (next: number) => void
  /** The "+" really adds (a check plays). False when it opens a chooser instead (a sized item), so nothing is confirmed. */
  confirmAdd?: boolean
  disabled?: boolean
  /** Sized items open a sheet instead of adding: show how many are already in the order as a count on the "+". */
  inOrder?: number
  /** Replaces the "+" / stepper entirely (e.g. "Ask the price", or the home page's link to the menu). */
  action?: ReactNode
  priority?: boolean
  as?: 'li' | 'div'
}) {
  const { t } = useT()
  const shown = BADGE_ORDER.filter((kind) => badges.includes(kind)).slice(0, 2)
  const [justAdded, setJustAdded] = useState(false)
  useEffect(() => {
    if (!justAdded) return
    const timer = window.setTimeout(() => setJustAdded(false), ADDED_MS)
    return () => window.clearTimeout(timer)
  }, [justAdded])
  const hasStepper = !action && !justAdded && qty > 0 && onQtyChange

  const add = () => {
    if (justAdded) return // the check is showing: a second tap would add again before the stepper appears
    onAdd?.()
    if (confirmAdd) setJustAdded(true)
  }

  return (
    <Card as={as} lift className="product-card @container flex h-full flex-col overflow-hidden border border-ink/10">
      <div className="photo-frame relative overflow-hidden">
        <Photo src={photo.src} alt={name} priority={priority} contain={photo.hasTransparency} />
        {shown.length > 0 && (
          <div className="absolute start-3 top-3 flex flex-wrap items-start gap-1.5">
            {shown.map((kind) => (
              <Badge key={kind} kind={kind} />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4 pt-3">
        <h3 className="heading-sans line-clamp-2 text-base font-bold leading-snug text-ink">{name}</h3>
        {description && <p className="line-clamp-1 text-base text-muted">{description}</p>}
        {extra}

        <div className="relative mt-auto flex min-h-[44px] items-end justify-between gap-2 pt-2">
          {price && (
            // On a narrow card the stepper needs the whole row, so the price steps aside (the cart bar shows the total).
            <PriceTag amount={price.amount} from={price.from} className={hasStepper ? '@max-[239px]:invisible' : ''} />
          )}
          {action ? (
            <div className="ms-auto">{action}</div>
          ) : hasStepper ? (
            <QuantityStepper value={qty} onChange={onQtyChange} min={0} compact noIncrease={disabled} className="pop absolute bottom-0 end-0" />
          ) : (
            <Button
              variant="icon"
              size="sm"
              disabled={disabled}
              onClick={add}
              aria-label={`${t('menu.add')}: ${name}`}
              className={`relative ms-auto shrink-0 ${justAdded ? 'add-done' : ''}`}
            >
              <Icon name={justAdded ? 'check' : 'plus'} />
              {inOrder > 0 && (
                <span
                  dir="ltr"
                  className="num absolute -end-1 -top-1 flex size-6 items-center justify-center rounded-full bg-ink text-sm text-on-action"
                >
                  {inOrder}
                </span>
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
