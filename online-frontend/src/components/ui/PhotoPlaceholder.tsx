import { Icon } from '../Icon'

/**
 * The stand-in for an item without a photo (or whose photo failed): a cream-to-sunflower wash with a faint forest food
 * icon in the middle, so it reads as designed, never as a broken image. Same 4:3 box as a photo. Decorative.
 */
export function PhotoPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`photo-placeholder flex aspect-[4/3] items-center justify-center ${className}`}>
      <Icon name="food" className="size-1/3 max-h-24 max-w-24 text-forest/25" />
    </div>
  )
}
