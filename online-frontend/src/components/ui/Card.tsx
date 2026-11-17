import type { ElementType, HTMLAttributes } from 'react'

/** White, 20px corners, the resting shadow, no border. `lift` raises it (raised shadow) on hover: desktop only, off under reduced motion. A card is a light surface even inside .tone-dark. */
export function Card({
  as,
  lift = false,
  className = '',
  ...rest
}: { as?: ElementType; lift?: boolean } & HTMLAttributes<HTMLElement>) {
  const Tag = as ?? 'div'
  return <Tag className={`card ${lift ? 'card-lift' : ''} ${className}`} {...rest} />
}
