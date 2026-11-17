import { Link } from 'react-router-dom'
import { useDeals } from '../../api/deals'
import { pick } from '../../lib/localized'
import { useRevealOnce } from '../../lib/useRevealOnce'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Skeleton } from '../Skeleton'
import { Card } from '../ui/Card'
import { SectionHeader } from '../ui/SectionHeader'
import { TilePhoto } from '../ui/TilePhoto'
import { useCategoryTiles } from './useCategoryTiles'

/**
 * "Order by craving": up to four tiles, each the same rounded photo box as a product card and a small Order now link. Deals first (starred ones first);
 * with no deals the first four categories stand in, linking to their menu section.
 */
export function DealsSection() {
  const { t, lang } = useT()
  const { data, isPending: dealsPending } = useDeals()
  const { tiles: categoryTiles, isPending: categoriesPending } = useCategoryTiles()
  const reveal = useRevealOnce<HTMLDivElement>()
  const deals = (data ?? [])
    .filter((deal) => deal.orderable)
    .sort((a, b) => Number(b.isFeatured === true) - Number(a.isFeatured === true))
    .slice(0, 4)
  const useCategories = !dealsPending && deals.length === 0
  const isPending = dealsPending || (useCategories && categoriesPending)
  const tiles = useCategories
    ? categoryTiles.slice(0, 4).map((tile) => ({ id: tile.id, name: tile.name, src: tile.src, hasTransparency: tile.hasTransparency, hash: `#sec-${tile.id}` }))
    : deals.map((deal) => ({
        id: deal.id,
        name: pick(lang, deal.name, deal.nameUr) ?? deal.name,
        src: deal.image?.thumb,
        hasTransparency: deal.image?.hasTransparency,
        hash: '#sec-deals',
      }))
  if (!isPending && tiles.length === 0) return null
  return (
    <section>
      <div ref={reveal} className="mx-auto max-w-page">
        <SectionHeader className="reveal-item" title={t('deals.title')} accent={t('deals.accent')} />
        {isPending ? (
          <div className="reveal-item grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {[0, 1].map((n) => (
              <Skeleton key={n} className="h-56" />
            ))}
          </div>
        ) : (
          <ul className="reveal-item grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {tiles.map((tile) => (
              <Card as="li" key={tile.id} lift className="flex flex-col items-center gap-2 p-2 pb-3 text-center">
                <TilePhoto src={tile.src} hasTransparency={tile.hasTransparency} />
                <h3 className="heading-sans text-lg font-semibold leading-snug">{tile.name}</h3>
                <Link
                  to={{ pathname: '/menu', hash: tile.hash }}
                  className="mt-auto inline-flex min-h-touch items-center gap-1 text-base font-bold text-accent underline-offset-4 hover:underline"
                >
                  <span>{t('nav.orderNow')}</span>
                  <Icon name="arrow" mirror className="size-5" />
                </Link>
              </Card>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
