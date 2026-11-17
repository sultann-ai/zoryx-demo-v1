import { Link, type LinkProps } from 'react-router-dom'
import { TilePhoto } from './TilePhoto'

/** A category: the same rounded photo box as a product card, then the name and the item count, on a white card that lifts on hover. */
export function CategoryTile({
  to,
  name,
  count,
  src,
  hasTransparency,
}: {
  to: LinkProps['to']
  name: string
  /** Already formatted (a translated sentence with the number inside). */
  count: React.ReactNode
  src: string | null | undefined
  hasTransparency?: boolean
}) {
  return (
    <Link to={to} className="card card-lift group flex min-h-touch w-36 flex-col items-center gap-2 p-2 pb-3 text-center md:w-40">
      <TilePhoto src={src} hasTransparency={hasTransparency} />
      <span className="text-lg font-semibold leading-snug text-ink">{name}</span>
      <span className="text-base text-muted">{count}</span>
    </Link>
  )
}
