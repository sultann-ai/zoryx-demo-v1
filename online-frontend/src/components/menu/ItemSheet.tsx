import { useId, useState } from 'react'
import type { MenuItem, MenuVariant } from '../../api/menu'
import { useCart } from '../../cart/context'
import { MAX_LINE_NOTE } from '../../cart/types'
import { formatRs } from '../../lib/format'
import { useIsPhone } from '../../lib/useAppMode'
import { pick } from '../../lib/localized'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Sheet } from '../Sheet'
import { Field, inputClass } from '../checkout/Field'
import { buttonClass } from '../ui/buttonClass'
import { QuantityStepper } from '../ui/QuantityStepper'
import { Photo } from './Photo'

/**
 * Size, add-ons and quantity for a sized item. Mounted only while open, so state starts fresh every time.
 * `withNotes` (the table QR menu) adds a short note for the kitchen; there the sheet also opens for an item without
 * sizes, so the guest can write one.
 */
export function ItemSheet({
  item,
  closed,
  onClose,
  withNotes = false,
}: {
  item: MenuItem
  closed: boolean
  onClose: () => void
  withNotes?: boolean
}) {
  const { t, lang } = useT()
  const cart = useCart()
  const phone = useIsPhone() // phones: a draggable bottom sheet that opens at about 85% height
  const name = pick(lang, item.name, item.nameUr) ?? item.name
  const description = pick(lang, item.description, item.descriptionUr)
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? '')
  const [addOnIds, setAddOnIds] = useState<string[]>([])
  const [qty, setQty] = useState(1)
  const [notes, setNotes] = useState('')
  const noteId = useId()

  // No variant: a plain item (only reached with withNotes), priced by the item itself.
  const variant: MenuVariant | undefined = item.variants.find((v) => v.id === variantId) ?? item.variants[0]
  const chosenAddOns = variant ? variant.addOns.filter((a) => addOnIds.includes(a.id)) : []
  const unit = Number.parseFloat((variant ? variant.price : item.price) ?? '0') + chosenAddOns.reduce((s, a) => s + Number.parseFloat(a.price), 0)
  const note = notes.trim().replace(/\s+/g, ' ')

  const pickVariant = (id: string) => {
    setVariantId(id)
    setAddOnIds([]) // add-ons belong to a size
  }
  const toggleAddOn = (id: string) =>
    setAddOnIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]))

  return (
    <Sheet
      title={name}
      onClose={onClose}
      draggable={phone}
      tall={phone}
      footer={
        <button
          type="button"
          disabled={closed}
          onClick={() => {
            cart.add(
              {
                kind: 'item',
                id: item.id,
                variantId: variant?.id ?? null,
                addOnIds: chosenAddOns.map((a) => a.id),
                ...(withNotes && note ? { notes: note } : {}),
              },
              qty,
            )
            onClose()
          }}
          className={`${buttonClass('primary', 'lg', 'w-full whitespace-nowrap !px-3')} disabled:opacity-40`}
        >
          <span>{t('menu.addToOrder')}</span>
          <span dir="ltr">- {formatRs(unit * qty)}</span>
        </button>
      }
    >
      <div className="space-y-5">
        {/* Large photo on white: a cut-out is shown whole, any other photo fills the box. */}
        <div className="overflow-hidden rounded-card bg-surface shadow-soft">
          <Photo
            src={item.image?.full ?? item.image?.thumb ?? item.imageUrl}
            alt={name}
            width={640}
            height={480}
            className="max-h-64 max-md:max-h-72"
            contain={item.image?.hasTransparency}
          />
        </div>
        {description && <p className="text-muted">{description}</p>}

        {variant && (
        <div role="radiogroup" aria-label={t('menu.chooseSize')} className="space-y-2">
          <h3 className="text-xl">{t('menu.chooseSize')}</h3>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
            {item.variants.map((v) => {
              const selected = v.id === variant.id
              return (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => pickVariant(v.id)}
                  className={`flex min-h-touch items-center justify-center gap-2 rounded-full px-4 py-1 transition-colors ${
                    selected ? 'bg-action text-on-action' : 'bg-surface text-ink shadow-soft'
                  }`}
                >
                  {selected && <Icon name="check" className="size-5 shrink-0" />}
                  <span className="font-bold">{v.label}</span>
                  <span dir="ltr" className={`font-bold ${selected ? 'text-on-action' : 'text-ink'}`}>
                    {formatRs(v.price ?? '0')}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
        )}

        {variant && variant.addOns.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xl">{t('menu.addOns')}</h3>
            <ul className="space-y-2">
              {variant.addOns.map((a) => {
                const on = addOnIds.includes(a.id)
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleAddOn(a.id)}
                      className="flex min-h-touch w-full items-center gap-3 rounded-card bg-surface px-4 text-start shadow-soft"
                    >
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-full border border-ink ${on ? 'bg-action text-on-action' : 'bg-surface text-transparent'}`}
                      >
                        <Icon name="check" />
                      </span>
                      <span className="flex-1">{a.name}</span>
                      <span dir="ltr" className="font-bold text-ink">
                        + {formatRs(a.price)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {withNotes && (
          <Field id={noteId} label={t('table.note.label')} hint={t('table.note.hint')}>
            <textarea
              id={noteId}
              rows={2}
              autoComplete="off"
              enterKeyHint="done"
              className={`${inputClass} border-muted py-3`}
              maxLength={MAX_LINE_NOTE}
              value={notes}
              placeholder={t('table.note.placeholder')}
              aria-describedby={`${noteId}-hint`}
              onChange={(event) => setNotes(event.target.value)}
            />
          </Field>
        )}

        <div className="flex items-center justify-between gap-4">
          <h3 className="text-xl">{t('menu.quantity')}</h3>
          <QuantityStepper value={qty} onChange={setQty} className="w-40" />
        </div>
      </div>
    </Sheet>
  )
}
