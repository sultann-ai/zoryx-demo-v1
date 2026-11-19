import { useEffect, useMemo, useState } from 'react'
import { useDeals, type Deal } from '../../api/deals'
import { useMenu, type MenuItem } from '../../api/menu'
import { pick } from '../../lib/localized'
import { useT } from '../../i18n'
import type { Section } from './CategoryChips'

// The menu's sections and the active-chip tracking, shared by the website's Menu page and the table QR menu (which
// reads its own menu through MenuSource, so the same code builds its sections).

// 2 columns on phones (1 below 340px so a card never gets cramped), 3 on tablets, 4 on desktop.
export const menuGridClass = 'grid grid-cols-2 gap-3 max-[339px]:grid-cols-1 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4'

export type MenuFilter = 'popular' | 'new' | 'deals'

const normalize = (text: string) => text.toLocaleLowerCase().replace(/\s+/g, ' ').trim()

/**
 * One section per category with something orderable, deals first; items with no (or an unknown) category go last.
 * `filter` narrows to Popular / New / Deals (the website's "See all"); `search` keeps what matches by name or
 * description, in either language.
 */
export function useMenuSections(filter: MenuFilter | null = null, search = '') {
  const { t, lang } = useT()
  const menu = useMenu()
  const deals = useDeals()
  const query = normalize(search)

  const result = useMemo(() => {
    const matches = (...texts: (string | null | undefined)[]) => query === '' || texts.some((text) => text && normalize(text).includes(query))
    const items = (menu.data?.items ?? [])
      .filter((i) => i.orderable || i.isOpenPrice)
      .filter((i) => (filter === 'popular' ? i.isFeatured : filter === 'new' ? i.isNew === true : filter === 'deals' ? false : true))
      .filter((i) => matches(i.name, i.nameUr, i.description, i.descriptionUr))
    const dealList: Deal[] =
      filter && filter !== 'deals' ? [] : (deals.data ?? []).filter((d) => d.orderable && matches(d.name, d.nameUr, d.description, d.descriptionUr))
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
  }, [menu.data, deals.data, lang, t, filter, query])

  return { ...result, menu, deals }
}

/**
 * The active chip is the last section whose top has scrolled past the sticky header + chips (the bar's real bottom
 * edge, so it also holds for the taller phone app bar with its safe-area inset). `jump` scrolls to a section.
 */
export function useActiveSection(sections: Section[]) {
  const [active, setActive] = useState('')
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

  const activeId = active && sections.some((s) => s.id === active) ? active : (sections[0]?.id ?? '')

  const jump = (id: string) => {
    setActive(id)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return { activeId, jump }
}
