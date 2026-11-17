import type { ReactNode } from 'react'
import { ButtonRoute } from './Button'

/**
 * The one section heading: optional small uppercase eyebrow, two-tone title (the accent word in the surface's accent
 * colour, on the same line when it fits: no forced break), optional muted subtitle, optional action.
 * One alignment rule everywhere: start-aligned; the action sits on the same row (opposite edge) from 768px, below the
 * title on phones. `seeAll` is a shortcut for the usual small "See all" secondary pill as the action.
 */
export function SectionHeader({
  title,
  accent,
  eyebrow,
  subtitle,
  action,
  seeAll,
  as: Tag = 'h2',
  id,
  className = '',
}: {
  title: string
  accent?: string
  eyebrow?: ReactNode
  subtitle?: ReactNode
  action?: ReactNode
  seeAll?: { to: string; label: string }
  as?: 'h1' | 'h2'
  id?: string
  className?: string
}) {
  const end =
    action ??
    (seeAll && (
      <ButtonRoute to={seeAll.to} variant="secondary" size="sm">
        {seeAll.label}
      </ButtonRoute>
    ))
  return (
    <div className={`mb-8 flex flex-col items-start gap-4 md:flex-row md:items-end md:justify-between md:gap-8 ${className}`}>
      <div className="flex min-w-0 flex-col items-start gap-2 text-start">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <Tag id={id} className="text-h2">
          {title}
          {accent && (
            <>
              {' '}
              <span className="accent-inline">{accent}</span>
            </>
          )}
        </Tag>
        {subtitle && <p className="max-w-xl text-lg text-muted">{subtitle}</p>}
      </div>
      {end && <div className="shrink-0">{end}</div>}
    </div>
  )
}
