import type { Deal } from '../../api/deals'
import { useCart } from '../../cart/context'
import { lineKey } from '../../cart/types'
import { pick } from '../../lib/localized'
import { useT } from '../../i18n'
import { ProductCard } from '../ui/ProductCard'

/** A deal is a fixed bundle (the API has no choice slots), so Add puts it straight in the cart. */
export function DealCard({ deal, closed, priority = false }: { deal: Deal; closed: boolean; priority?: boolean }) {
  const { t, lang } = useT()
  const cart = useCart()
  const name = pick(lang, deal.name, deal.nameUr) ?? deal.name
  const description = pick(lang, deal.description, deal.descriptionUr)
  const key = lineKey({ kind: 'deal', id: deal.id, variantId: null, addOnIds: [] })
  const qty = cart.lines.find((l) => lineKey(l) === key)?.qty ?? 0
  const contents = deal.items
    .map((i) => `${i.quantity > 1 ? `${i.quantity}× ` : ''}${pick(lang, i.menuItem.name, i.menuItem.nameUr) ?? i.menuItem.name}`)
    .join('، ')

  return (
    <ProductCard
      name={name}
      description={description}
      photo={{ src: deal.image?.thumb, hasTransparency: deal.image?.hasTransparency }}
      badges={deal.isFeatured ? ['deal', 'popular'] : ['deal']}
      price={{ amount: deal.price }}
      extra={
        contents ? (
          <p className="line-clamp-2 text-sm text-muted">
            {t('menu.includes')}: {contents}
          </p>
        ) : null
      }
      qty={qty}
      onQtyChange={(next) => cart.setQty(key, next)}
      onAdd={() => cart.add({ kind: 'deal', id: deal.id, variantId: null, addOnIds: [] })}
      disabled={closed}
      priority={priority}
    />
  )
}
