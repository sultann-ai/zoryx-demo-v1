import type { HTMLAttributes } from 'react'
import { Icon, type IconName } from '../Icon'

// px, not Tailwind steps (those are 4.5px here, the root font being 18px): md 48px (feature cards), lg 56px ("How to order").
const sizes = { md: 'size-tap', lg: 'size-[56px]' } as const
// lg keeps its icon to 24px so a corner chip (the step number) never overlaps it.
const iconSizes = { md: 'size-6', lg: 'size-[24px]' } as const

/**
 * A round icon on the surface's fill: forest with a cream icon on light, lime with an ink icon inside .tone-dark.
 * `children` render on top (the step number of "How to order"). Pass aria-hidden when it is pure decoration.
 */
export function IconCircle({
  icon,
  size = 'md',
  className = '',
  children,
  ...rest
}: { icon: IconName; size?: keyof typeof sizes } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`tone-fill relative flex shrink-0 items-center justify-center rounded-full ${sizes[size]} ${className}`} {...rest}>
      <Icon name={icon} className={iconSizes[size]} />
      {children}
    </span>
  )
}
