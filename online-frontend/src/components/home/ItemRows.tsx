import { displayPrice, useMenu, type MenuItem } from '../../api/menu'
import { pick } from '../../lib/localized'
import { useRevealOnce } from '../../lib/useRevealOnce'
import { useT, type TranslationKey } from '../../i18n'
import { Icon } from '../Icon'
import { ButtonRoute } from '../ui/Button'
import { ProductCard } from '../ui/ProductCard'
import { ProductCardSkeleton } from '../ui/ProductCardSkeleton'
import { SectionHeader } from '../ui/SectionHeader'

/**
 * A preview card: the round button goes to the menu (the cart lives there), so nothing is added from the home page.
 * Badges come from the item itself (Popular if starred, New if recent) and ProductCard puts them in the one fixed order,
 * so a card looks the same in both sections. `className` sizes the list item: a fixed width in the phone's snap rows.
 */
export function PreviewCard({ item, className = 'w-56 shrink-0' }: { item: MenuItem; className?: string }) {
  const { t, lang } = useT()
  const price = displayPrice(item)
  const name = pick(lang, item.name, item.nameUr) ?? item.name
  const badges: ('popular' | 'new')[] = []
  if (item.isFeatured) badges.push('popular')
  if (item.isNew) badges.push('new')
  return (
    <li className={className}>
      <ProductCard
        as="div"
        name={name}
        description={pick(lang, item.description, item.descriptionUr)}
        photo={{ src: item.image?.thumb ?? item.imageUrl, hasTransparency: item.image?.hasTransparency }}
        badges={badges}
        price={price ? { amount: price.amount, from: price.from } : null}
        action={
          <ButtonRoute to="/menu" variant="icon" size="sm" aria-label={`${t('nav.orderNow')}: ${name}`}>
            <Icon name="cart" />
          </ButtonRoute>
        }
      />
    </li>
  )
}

// 1 column under 480px, 2 to 768px, 3 to 1024px, 4 above. Fewer cards than columns keep their column width and sit at
// the start of the row: a grid never stretches one card across it.
const grid = 'grid grid-cols-1 gap-5 min-[480px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
// While loading: one row of skeletons, as many as the columns at this width.
const skeletonVisibility = ['', 'max-[479px]:hidden', 'max-md:hidden', 'max-lg:hidden']

function ItemRow({
  title,
  accent,
  pick: select,
}: {
  title: TranslationKey
  accent: TranslationKey
  pick: (item: MenuItem) => boolean
}) {
  const { t } = useT()
  const reveal = useRevealOnce<HTMLDivElement>()
  const { data, isPending } = useMenu()
  const items = (data?.items ?? [])
    .filter((item) => (item.orderable || item.isOpenPrice) && select(item))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 8)
  if (!isPending && items.length === 0) return null
  return (
    <section>
      <div ref={reveal} className="mx-auto max-w-page">
        <SectionHeader className="reveal-item" title={t(title)} accent={t(accent)} seeAll={{ to: '/menu', label: t('home.seeAll') }} />
        {isPending ? (
          <ul className={`reveal-item ${grid}`} aria-hidden="true">
            {skeletonVisibility.map((visibility, n) => (
              <ProductCardSkeleton key={n} className={visibility} />
            ))}
          </ul>
        ) : (
          <ul className={`reveal-item ${grid}`}>
            {items.map((item) => (
              <PreviewCard key={item.id} item={item} className="min-w-0" />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Items the owner starred as Popular in the POS. */
export function PopularSection() {
  return <ItemRow title="popular.title" accent="popular.accent" pick={(item) => item.isFeatured} />
}

/** Items created in the last 14 days (the API sets isNew). */
export function NewSection() {
  return <ItemRow title="new.title" accent="new.accent" pick={(item) => item.isNew === true} />
}
