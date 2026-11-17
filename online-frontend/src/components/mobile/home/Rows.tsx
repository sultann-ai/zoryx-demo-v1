import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '../../../api/client'
import { useDeals, type Deal } from '../../../api/deals'
import { useMenu, type MenuItem } from '../../../api/menu'
import { pick } from '../../../lib/localized'
import { useT } from '../../../i18n'
import { PreviewCard } from '../../home/ItemRows'
import { useCategoryTiles } from '../../home/useCategoryTiles'
import { Icon } from '../../Icon'
import { Skeleton } from '../../Skeleton'
import { ButtonRoute } from '../../ui/Button'
import { PhotoPlaceholder } from '../../ui/PhotoPlaceholder'
import { ProductCard } from '../../ui/ProductCard'

/** Compact section title with an optional "See all" pill on the opposite edge. */
export function RowHeader({ title, seeAll }: { title: string; seeAll?: string }) {
  const { t } = useT()
  return (
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 className="min-w-0 text-xl leading-tight">{title}</h2>
      {seeAll && (
        <ButtonRoute to={seeAll} variant="secondary" size="sm" className="shrink-0">
          {t('home.seeAll')}
        </ButtonRoute>
      )}
    </div>
  )
}

// ---- Category icons: round photo tiles, each opens that category on the Menu tab ----
const TILE = 72

export function CategoryIcons() {
  const { tiles, isPending } = useCategoryTiles()
  if (isPending)
    return (
      <div className="flex gap-4 overflow-hidden" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((n) => (
          <div key={n} className="flex w-20 shrink-0 flex-col items-center gap-2">
            <Skeleton className="size-[72px] !rounded-full" />
            <Skeleton className="h-6 w-14" />
          </div>
        ))}
      </div>
    )
  if (tiles.length === 0) return null
  return (
    <ul className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4">
      {tiles.map((tile) => (
        <li key={tile.id} className="w-20 shrink-0 snap-start">
          <Link to={{ pathname: '/menu', hash: `#sec-${tile.id}` }} className="flex min-h-touch flex-col items-center gap-1 text-center">
            {tile.src ? (
              <img
                src={apiUrl(tile.src)}
                alt=""
                width={TILE}
                height={TILE}
                loading="lazy"
                decoding="async"
                className={`size-[72px] rounded-full shadow-soft ${tile.hasTransparency ? 'bg-surface object-contain p-1' : 'object-cover'}`}
              />
            ) : (
              <PhotoPlaceholder className="!aspect-square size-[72px] overflow-hidden rounded-full shadow-soft [&_*]:!size-10" />
            )}
            <span className="line-clamp-2 text-sm font-semibold leading-tight text-ink">{tile.name}</span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

// ---- Horizontal snap rows built on the one product card ----
function RowShell({ title, seeAll, pending, empty, children }: { title: string; seeAll: string; pending: boolean; empty: boolean; children: ReactNode }) {
  if (!pending && empty) return null
  return (
    <section>
      <RowHeader title={title} seeAll={seeAll} />
      {pending ? (
        <div className="flex gap-4 overflow-hidden" aria-hidden="true">
          {[0, 1].map((n) => (
            <Skeleton key={n} className="h-[360px] w-56 shrink-0" />
          ))}
        </div>
      ) : (
        <ul className="snap-row -mx-4 px-4">{children}</ul>
      )}
    </section>
  )
}

function ItemsRow({ title, seeAll, select }: { title: string; seeAll: string; select: (item: MenuItem) => boolean }) {
  const { data, isPending } = useMenu()
  const items = (data?.items ?? [])
    .filter((item) => (item.orderable || item.isOpenPrice) && select(item))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .slice(0, 8)
  return (
    <RowShell title={title} seeAll={seeAll} pending={isPending} empty={items.length === 0}>
      {items.map((item) => (
        <PreviewCard key={item.id} item={item} />
      ))}
    </RowShell>
  )
}

export function PopularRow() {
  const { t } = useT()
  return <ItemsRow title={`${t('popular.title')} ${t('popular.accent')}`} seeAll="/menu?filter=popular" select={(item) => item.isFeatured} />
}

export function NewRow() {
  const { t } = useT()
  return <ItemsRow title={`${t('new.title')} ${t('new.accent')}`} seeAll="/menu?filter=new" select={(item) => item.isNew === true} />
}

function DealPreview({ deal }: { deal: Deal }) {
  const { t, lang } = useT()
  return (
    <li className="w-56 shrink-0">
      <ProductCard
        as="div"
        name={pick(lang, deal.name, deal.nameUr) ?? deal.name}
        description={pick(lang, deal.description, deal.descriptionUr)}
        photo={{ src: deal.image?.thumb, hasTransparency: deal.image?.hasTransparency }}
        badges={['deal']}
        price={{ amount: deal.price }}
        action={
          <ButtonRoute to="/menu?filter=deals" variant="icon" size="sm" aria-label={`${t('nav.orderNow')}: ${pick(lang, deal.name, deal.nameUr) ?? deal.name}`}>
            <Icon name="cart" />
          </ButtonRoute>
        }
      />
    </li>
  )
}

export function DealsRow() {
  const { t } = useT()
  const { data, isPending } = useDeals()
  const deals = (data ?? [])
    .filter((deal) => deal.orderable)
    .sort((a, b) => Number(b.isFeatured === true) - Number(a.isFeatured === true))
    .slice(0, 8)
  return (
    <RowShell title={t('menu.deals')} seeAll="/menu?filter=deals" pending={isPending} empty={deals.length === 0}>
      {deals.map((deal) => (
        <DealPreview key={deal.id} deal={deal} />
      ))}
    </RowShell>
  )
}
