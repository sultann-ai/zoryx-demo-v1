import { useEffect, useRef } from 'react'
import { useT } from '../../i18n'
import { CategoryChip } from '../ui/Chip'

export interface Section {
  id: string
  title: string
}

/** Sticky, horizontally scrollable chips. The active chip follows the scroll position. */
export function CategoryChips({ sections, active, onPick }: { sections: Section[]; active: string; onPick: (id: string) => void }) {
  const { t } = useT()
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    // Keep the active chip visible inside the row without moving the page itself.
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [active])

  return (
    <nav id="menu-chips" aria-label={t('menu.categories')} className="sticky top-16 z-20 max-md:top-[var(--header-h)] bg-canvas/95 shadow-soft backdrop-blur">
      <ul className="no-scrollbar mx-auto flex max-w-page-padded gap-2 overflow-x-auto px-gutter py-2">
        {sections.map((section) => {
          const on = section.id === active
          return (
            <li key={section.id} className="shrink-0">
              <CategoryChip ref={on ? activeRef : undefined} active={on} onClick={() => onPick(section.id)}>
                {section.title}
              </CategoryChip>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
