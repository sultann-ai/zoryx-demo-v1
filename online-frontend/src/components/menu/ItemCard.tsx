import { displayPrice, type MenuItem } from '../../api/menu'
import { useCart } from '../../cart/context'
import { lineKey } from '../../cart/types'
import { phoneHref, waHref } from '../../lib/config'
import { pick } from '../../lib/localized'
import { useShopWhatsApp } from '../../lib/useShopContact'
import { useShopPhone } from '../../lib/useShopPhone'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { buttonClass } from '../ui/buttonClass'
import { ProductCard } from '../ui/ProductCard'

// A round 44px outline button (the same circle as the card's "+"): the words go in the card text, because a pill with words wraps badly in a narrow card.
const ROUND = 'text-ink !size-[44px] !min-h-0 !rounded-full !p-0'

export function ItemCard({
  item,
  closed,
  onOpen,
  priority = false,
}: {
  item: MenuItem
  closed: boolean
  onOpen: (item: MenuItem) => void
  priority?: boolean
}) {
  const { t, lang } = useT()
  const cart = useCart()
  const phone = useShopPhone()
  const whatsapp = useShopWhatsApp()
  const name = pick(lang, item.name, item.nameUr) ?? item.name
  const description = pick(lang, item.description, item.descriptionUr)
  const price = displayPrice(item)
  const sized = item.variants.length > 0

  const fixedKey = lineKey({ kind: 'item', id: item.id, variantId: null, addOnIds: [] })
  const fixedQty = cart.lines.find((l) => lineKey(l) === fixedKey)?.qty ?? 0
  const sizedQty = sized ? cart.lines.filter((l) => l.kind === 'item' && l.id === item.id).reduce((s, l) => s + l.qty, 0) : 0

  // An open-price item has no price to add: ask the shop on WhatsApp, or call.
  let action
  if (item.isOpenPrice) {
    const number = whatsapp
    action = number ? (
      <a
        href={`${waHref(number)}?text=${encodeURIComponent(t('menu.askMsg').replace('{item}', name))}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t('menu.askPrice')}
        className={buttonClass('secondary', 'md', ROUND)}
      >
        <Icon name="whatsapp" />
      </a>
    ) : (
      <a href={phoneHref(phone)} aria-label={t('contact.call')} className={buttonClass('secondary', 'md', ROUND)}>
        <Icon name="phone" />
      </a>
    )
  }

  const badges: ('popular' | 'new')[] = []
  if (item.isFeatured) badges.push('popular')
  if (item.isNew) badges.push('new')

  return (
    <ProductCard
      name={name}
      description={description}
      photo={{ src: item.image?.thumb ?? item.imageUrl, hasTransparency: item.image?.hasTransparency }}
      badges={badges}
      price={price && !item.isOpenPrice ? { amount: price.amount, from: price.from } : null}
      qty={sized ? 0 : fixedQty}
      onQtyChange={(next) => cart.setQty(fixedKey, next)}
      onAdd={() => (sized ? onOpen(item) : cart.add({ kind: 'item', id: item.id, variantId: null, addOnIds: [] }))}
      confirmAdd={!sized}
      inOrder={sizedQty}
      disabled={closed}
      action={action}
      extra={item.isOpenPrice ? <p className="text-sm text-muted">{whatsapp ? t('menu.askPrice') : t('contact.call')}</p> : null}
      priority={priority}
    />
  )
}
