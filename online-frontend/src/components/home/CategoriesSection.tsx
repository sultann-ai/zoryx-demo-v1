import { useRevealOnce } from '../../lib/useRevealOnce'
import { useT } from '../../i18n'
import { Fill } from '../Fill'
import { Skeleton } from '../Skeleton'
import { SectionHeader } from '../ui/SectionHeader'
import { useCategoryTiles } from './useCategoryTiles'
import { CategoryTile } from '../ui/CategoryTile'

/** Featured categories: white tiles with a round photo, the name and the count. A scroll row on phones, a wrapped row from tablet up. */
export function CategoriesSection() {
  const { t } = useT()
  const { tiles, isPending } = useCategoryTiles()
  const reveal = useRevealOnce<HTMLDivElement>()

  if (!isPending && tiles.length === 0) return null
  return (
    <section>
      <div ref={reveal} className="mx-auto max-w-page">
        <SectionHeader className="reveal-item" title={t('cats.title')} accent={t('cats.accent')} />
        {isPending ? (
          <div className="reveal-item flex gap-6 overflow-hidden">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-52 w-36 shrink-0" />
            ))}
          </div>
        ) : (
          <ul className="reveal-item snap-row md:flex-wrap md:justify-center md:overflow-visible">
            {tiles.map((tile) => (
              <li key={tile.id} className="shrink-0">
                <CategoryTile
                  to={{ pathname: '/menu', hash: `#sec-${tile.id}` }}
                  name={tile.name}
                  src={tile.src}
                  hasTransparency={tile.hasTransparency}
                  count={<Fill text={tile.count === 1 ? t('cats.countOne') : t('cats.count')} values={{ n: String(tile.count) }} />}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
