import { Card } from './Card'
import { Skeleton } from '../Skeleton'

/**
 * A ProductCard-shaped placeholder with the same frame: hairline border, full-width 4:3 photo, the name, a description
 * line, then the price and the 44px round button. Same boxes as the real card, so nothing jumps when the data arrives.
 */
export function ProductCardSkeleton({ as = 'li', className = '' }: { as?: 'li' | 'div'; className?: string }) {
  return (
    <Card as={as} aria-hidden="true" className={`flex h-full flex-col overflow-hidden border border-ink/10 ${className}`}>
      <Skeleton className="aspect-[4/3] h-auto w-full !rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-4 pt-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <div className="mt-auto flex items-end justify-between pt-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="size-[44px] !rounded-full" />
        </div>
      </div>
    </Card>
  )
}
