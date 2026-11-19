import { useId, useState } from 'react'
import type { MenuItem } from '../../api/menu'
import { usePruneCart } from '../../cart/pricing'
import { ErrorState } from '../../components/ErrorState'
import { Icon } from '../../components/Icon'
import { CategoryChips } from '../../components/menu/CategoryChips'
import { DealCard } from '../../components/menu/DealCard'
import { ItemCard } from '../../components/menu/ItemCard'
import { ItemSheet } from '../../components/menu/ItemSheet'
import { SectionCount } from '../../components/menu/SectionCount'
import { menuGridClass, useActiveSection, useMenuSections } from '../../components/menu/useMenuSections'
import { Skeleton } from '../../components/Skeleton'
import { SlowHint } from '../../components/SlowHint'
import { Button } from '../../components/ui/Button'
import { ProductCardSkeleton } from '../../components/ui/ProductCardSkeleton'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { useHistoryLayer } from '../../lib/useHistoryLayer'
import { useT } from '../../i18n'

/** Keeps the joined guest's cart in step with the QR menu (an item switched off since it was added drops out). */
function PruneCart() {
  usePruneCart()
  return null
}

export function MenuSkeleton() {
  return (
    <div role="status" className="space-y-6 px-4 py-4">
      <span className="sr-only">…</span>
      <Skeleton className="h-touch w-full !rounded-full" />
      <div className="flex gap-2 overflow-hidden">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-touch w-28 shrink-0 !rounded-full" />
        ))}
      </div>
      <SlowHint />
      <ul className={menuGridClass}>
        {[0, 1, 2, 3].map((n) => (
          <ProductCardSkeleton key={n} />
        ))}
      </ul>
    </div>
  )
}

/**
 * The table's menu (GET /api/online/table/menu through the surrounding MenuSource): a search field, the sticky category
 * chips and the website's own cards. `readOnly` (a table nobody has seated) shows no add buttons at all; `closed` (a
 * joined guest while ordering is off) shows them disabled. Joined guests get the item sheet with sizes, add-ons and a
 * note for the kitchen on every item.
 */
export function QrMenu({ readOnly = false, closed = false }: { readOnly?: boolean; closed?: boolean }) {
  const { t } = useT()
  const searchId = useId()
  const [search, setSearch] = useState('')
  const { sections, itemsBySection, dealList, menu } = useMenuSections(null, search)
  const { activeId, jump } = useActiveSection(sections)
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null)
  useHistoryLayer(sheetItem !== null, () => setSheetItem(null))

  if (menu.isPending) return <MenuSkeleton />
  if (menu.isError) return <ErrorState error={menu.error} onRetry={() => void menu.refetch()} />

  const nothingOnMenu = search === '' && sections.length === 0
  if (nothingOnMenu) {
    return (
      <div className="mx-4 my-6 flex flex-col items-center gap-3 rounded-card bg-band p-6 text-center">
        <Icon name="cup" className="size-10" />
        <p className="text-lg">{t('table.menuEmpty')}</p>
      </div>
    )
  }

  return (
    <>
      {!readOnly && <PruneCart />}
      <div className="px-4 pb-2 pt-3">
        <label htmlFor={searchId} className="sr-only">
          {t('table.search')}
        </label>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted" />
          <input
            id={searchId}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('table.search')}
            className="min-h-touch w-full rounded-full border border-ink/15 bg-surface pe-4 ps-12 text-lg text-ink shadow-soft placeholder:text-muted"
          />
        </div>
      </div>

      {sections.length === 0 ? (
        <div role="status" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <Icon name="search" className="size-10 text-muted" />
          <p className="text-lg">{t('table.noMatch')}</p>
          <Button variant="secondary" onClick={() => setSearch('')}>
            {t('table.clearSearch')}
          </Button>
        </div>
      ) : (
        <>
          <CategoryChips sections={sections} active={activeId} onPick={jump} stickyTop="top-[var(--header-h)]" />
          <div className="space-y-10 px-4 pb-8 pt-6">
            {sections.map((section, sectionIndex) => (
              <section key={section.id} id={`sec-${section.id}`} className="scroll-mt-[calc(var(--header-h)+5rem)]" aria-labelledby={`h-${section.id}`}>
                <SectionHeader
                  id={`h-${section.id}`}
                  title={section.title}
                  subtitle={<SectionCount n={section.id === 'deals' ? dealList.length : (itemsBySection.get(section.id)?.length ?? 0)} deals={section.id === 'deals'} />}
                  className="!mb-4"
                />
                <ul className={menuGridClass}>
                  {section.id === 'deals'
                    ? dealList.map((deal, i) => (
                        <DealCard key={deal.id} deal={deal} closed={closed} readOnly={readOnly} priority={sectionIndex === 0 && i < 2} />
                      ))
                    : itemsBySection.get(section.id)?.map((item, i) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          closed={closed}
                          readOnly={readOnly}
                          alwaysOpen
                          onOpen={setSheetItem}
                          priority={sectionIndex === 0 && i < 2}
                        />
                      ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
      {sheetItem && <ItemSheet item={sheetItem} closed={closed} withNotes onClose={() => setSheetItem(null)} />}
    </>
  )
}
