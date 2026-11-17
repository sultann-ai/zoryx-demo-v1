import type { ComponentProps, ReactNode } from 'react'

/** A small eyebrow pill, optionally with a status dot ("Open now"): a green (success) dot, grey when closed. Lime is never used on a light surface. The dot is decoration: the words carry the meaning. */
export function Chip({ children, dot = false, className = '' }: { children: ReactNode; dot?: boolean | 'closed'; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full bg-surface px-4 py-1 text-sm font-bold text-ink shadow-soft ${className}`}>
      {dot && <span aria-hidden="true" className={`size-2.5 rounded-full ${dot === 'closed' ? 'bg-muted' : 'bg-success'}`} />}
      {children}
    </span>
  )
}

/** A category chip: a 48px+ pill button. `active` is announced with aria-current, not just by colour. */
export function CategoryChip({
  active = false,
  className = '',
  children,
  ...rest
}: { active?: boolean } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-current={active ? 'true' : undefined}
      className={`min-h-touch whitespace-nowrap rounded-full px-5 text-lg font-bold transition-colors ${
        active ? 'bg-action text-on-action' : 'bg-surface text-ink shadow-soft'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}
