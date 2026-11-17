import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDeals } from '../api/deals'
import { useMenu, type MenuItem } from '../api/menu'
import { useStore } from '../api/store'
import { usePruneCart } from '../cart/pricing'
import { Announcement } from '../components/home/Announcement'
import { ErrorState } from '../components/ErrorState'
import { CategoryChips, type Section } from '../components/menu/CategoryChips'
import { CartBar } from '../components/menu/CartBar'
import { CartSheet } from '../components/menu/CartSheet'
import { ClosedBanner, LastOrderBanner } from '../components/menu/Banners'
import { DealCard } from '../components/menu/DealCard'
import { ItemCard } from '../components/menu/ItemCard'
import { ItemSheet } from '../components/menu/ItemSheet'
import { Fill } from '../components/Fill'
import { Icon } from '../components/Icon'
import { SlowHint } from '../components/SlowHint'
import { Skeleton } from '../components/Skeleton'
import { ButtonLink, ButtonRoute } from '../components/ui/Button'
import { Chip } from '../components/ui/Chip'
import { Card } from '../components/ui/Card'
import { ProductCardSkeleton } from '../components/ui/ProductCardSkeleton'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusChip } from '../components/ui/StatusChip'
import { UndoToast } from '../components/UndoToast'
import { phoneHref } from '../lib/config'
import { useIsPhone } from '../lib/useAppMode'
import { AppState } from '../components/mobile/AppState'
import { pick } from '../lib/localized'
import { useHistoryLayer } from '../lib/useHistoryLayer'
import { useShopPhone } from '../lib/useShopPhone'
import { useScrollToHash } from '../lib/useScrollToHash'
import { useT } from '../i18n'

// The checkout (form, validation, error mapping) loads only when someone taps Continue.
const CheckoutSheet = lazy(() => import('../components/checkout/CheckoutSheet').then((m) => ({ default: m.CheckoutSheet })))

// 2 columns on phones (1 below 340px so a card never gets cramped), 3 on tablets, 4 on desktop.
const gridClass = 'grid grid-cols-2 gap-3 max-[339px]:grid-cols-1 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4'

/** "12 items" / "3 deals" under a section title (numbers go through <Fill> so they stay left-to-right in Urdu). */
function SectionCount({ n, deals }: { n: number; deals: boolean }) {
  const { t } = useT()
  const key = deals ? (n === 1 ? 'menu.dealsCountOne' : 'menu.dealsCount') : n === 1 ? 'cats.countOne' : 'cats.count'
  return <Fill text={t(key)} values={{ n: String(n) }} />
}

type MenuFilter = 'popular' | 'new' | 'deals'

export default function Menu() {
  const { t, lang } = useT()
  // /menu?filter=popular|new|deals is what "See all" on the phone Home opens: the same menu, narrowed to that list.
  const [params] = useSearchParams()
  const filterParam = params.get('filter')
  const filter: MenuFilter | null = filterParam === 'popular' || filterParam === 'new' || filterParam === 'deals' ? filterParam : null
  const menu = useMenu()
  const deals = useDeals()
  const store = useStore()
  const phone = useShopPhone()
  const isPhone = useIsPhone()
  usePruneCart()

  const closed = store.data ? !store.data.orderingOpen : false
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [active, setActive] = useState('')

  // Back (browser or Android) closes whichever sheet is open instead of leaving the menu.
  useHistoryLayer(sheetItem !== null || cartOpen || checkoutOpen, () => {
    setSheetItem(null)
    setCartOpen(false)
    setCheckoutOpen(false)
  })

  // One section per category with something orderable, deals first. Items with no (or an unknown) category go last.
  const { sections, itemsBySection, dealList } = useMemo(() => {
    const items = (menu.data?.items ?? [])
      .filter((i) => i.orderable || i.isOpenPrice)
      .filter((i) => (filter === 'popular' ? i.isFeatured : filter === 'new' ? i.isNew === true : filter === 'deals' ? false : true))
    const dealList = filter && filter !== 'deals' ? [] : (deals.data ?? []).filter((d) => d.orderable)
    const known = new Set((menu.data?.categories ?? []).map((c) => c.id))
    const bySection = new Map<string, MenuItem[]>()
    const list: Section[] = []
    if (dealList.length > 0) list.push({ id: 'deals', title: t('menu.deals') })
    for (const category of menu.data?.categories ?? []) {
      const inCategory = items.filter((i) => i.categoryId === category.id)
      if (inCategory.length === 0) continue
      bySection.set(category.id, inCategory)
      list.push({ id: category.id, title: pick(lang, category.name, category.nameUr) ?? category.name })
    }
    const other = items.filter((i) => !i.categoryId || !known.has(i.categoryId))
    if (other.length > 0) {
      bySection.set('other', other)
      list.push({ id: 'other', title: t('menu.other') })
    }
    return { sections: list, itemsBySection: bySection, dealList }
  }, [menu.data, deals.data, lang, t, filter])

  const filterLabel =
    filter === 'popular' ? `${t('popular.title')} ${t('popular.accent')}` : filter === 'new' ? `${t('new.title')} ${t('new.accent')}` : filter === 'deals' ? t('menu.deals') : ''

  // The active chip is the last section whose top has scrolled past the sticky header + chips (the bar's real bottom edge,
  // so it also holds for the taller phone app bar with its safe-area inset).
  const sectionIds = sections.map((s) => s.id).join('|')
  useEffect(() => {
    if (sectionIds === '') return
    const ids = sectionIds.split('|')
    let frame = 0
    const update = () => {
      frame = 0
      let current = ids[0]
      const chips = document.getElementById('menu-chips')
      const limit = chips ? chips.getBoundingClientRect().bottom + 12 : 150
      for (const id of ids) {
        const node = document.getElementById(`sec-${id}`)
        if (node && node.getBoundingClientRect().top <= limit) current = id
      }
      setActive(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [sectionIds])

  // A link from the home page (/menu#sec-<category>) lands on that category once the menu has rendered.
  useScrollToHash(sections.length > 0)

  const activeId = active && sections.some((s) => s.id === active) ? active : (sections[0]?.id ?? '')

  const jump = (id: string) => {
    setActive(id)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  // The menu is what matters: deals that fail to load just leave the Deals section out.
  const loading = menu.isPending
  const failed = menu.isError ? menu : null

  return (
    <>
      {/* Compact header strip: shop name, open / closed chip, then the announcement (if staff set one). */}
      <div className="px-gutter pb-4 pt-2">
        <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* On phones the app shell's large title says "Menu"; this stays for screen readers. */}
          <h1 className="text-3xl leading-tight max-md:sr-only">
            {pick(lang, store.data?.settings.shopNameEn, store.data?.settings.shopNameUr) ?? t('brand.name')}
            <span className="sr-only"> — {t('menu.title')}</span>
          </h1>
          <StatusChip />
        </div>
      </div>
      <Announcement />

      {filter && (
        <div className="mx-auto flex max-w-page flex-wrap items-center gap-3 px-gutter pb-3">
          <Chip>
            {t('menu.filter.showing')}: <span className="font-bold">{filterLabel}</span>
          </Chip>
          <ButtonRoute to="/menu" variant="secondary" size="sm">
            {t('menu.filter.all')}
          </ButtonRoute>
        </div>
      )}

      <div className="px-4">
        <ClosedBanner />
        <LastOrderBanner />
      </div>

      {loading ? (
        <div className="mx-auto min-h-[120svh] max-w-page-padded space-y-6 px-gutter py-6">
          <div className="flex gap-2 overflow-hidden">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-touch w-28 shrink-0 !rounded-full" />
            ))}
          </div>
          <SlowHint />
          <ul className={gridClass}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
              <ProductCardSkeleton key={n} />
            ))}
          </ul>
        </div>
      ) : failed ? (
        <ErrorState error={failed.error} onRetry={() => void failed.refetch()} />
      ) : sections.length === 0 && isPhone ? (
        <AppState icon="cup" title={t('menu.empty')}>
          <ButtonLink href={phoneHref(phone)}>
            <Icon name="phone" />
            <span dir="ltr">{phone}</span>
          </ButtonLink>
        </AppState>
      ) : sections.length === 0 ? (
        <div className="mx-auto max-w-md px-4 py-12">
          <Card className="flex flex-col items-center gap-4 p-8 text-center">
            <span className="flex size-20 items-center justify-center rounded-full bg-band text-ink">
              <Icon name="cup" className="size-10" />
            </span>
            <p className="text-xl">{t('menu.empty')}</p>
            <ButtonLink href={phoneHref(phone)}>
              <Icon name="phone" />
              <span dir="ltr">{phone}</span>
            </ButtonLink>
          </Card>
        </div>
      ) : (
        <>
          <CategoryChips sections={sections} active={activeId} onPick={jump} />
          <div className="mx-auto max-w-page-padded space-y-12 px-gutter pb-32 pt-8">
            {sections.map((section, sectionIndex) => (
              <section key={section.id} id={`sec-${section.id}`} className="scroll-mt-36 max-md:scroll-mt-[calc(var(--header-h)+5rem)]" aria-labelledby={`h-${section.id}`}>
                <SectionHeader
                  id={`h-${section.id}`}
                  title={section.title}
                  subtitle={<SectionCount n={section.id === 'deals' ? dealList.length : (itemsBySection.get(section.id)?.length ?? 0)} deals={section.id === 'deals'} />}
                  className="!mb-4"
                />
                <ul className={gridClass}>
                  {section.id === 'deals'
                    ? dealList.map((deal, i) => <DealCard key={deal.id} deal={deal} closed={closed} priority={sectionIndex === 0 && i < 2} />)
                    : itemsBySection.get(section.id)?.map((item, i) => (
                        <ItemCard key={item.id} item={item} closed={closed} onOpen={setSheetItem} priority={sectionIndex === 0 && i < 2} />
                      ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <UndoToast announce className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm max-md:hidden" />
      <CartBar onView={() => setCartOpen(true)} />
      {sheetItem && <ItemSheet item={sheetItem} closed={closed} onClose={() => setSheetItem(null)} />}
      {cartOpen && (
        <CartSheet
          closed={closed}
          onClose={() => setCartOpen(false)}
          onContinue={() => {
            setCartOpen(false)
            setCheckoutOpen(true)
          }}
        />
      )}
      {checkoutOpen && (
        <Suspense fallback={null}>
          <CheckoutSheet onClose={() => setCheckoutOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
