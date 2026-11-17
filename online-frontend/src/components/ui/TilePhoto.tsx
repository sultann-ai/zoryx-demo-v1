import { Photo } from '../menu/Photo'

/**
 * The photo of a category or deal tile: the same rounded 4:3 box as on a product card (a cut-out is shown whole,
 * any other photo fills it, no photo shows the branded stand-in). Decorative: the tile's name is the text.
 */
export function TilePhoto({ src, hasTransparency }: { src: string | null | undefined; hasTransparency?: boolean }) {
  return (
    <div className="w-full overflow-hidden rounded-inner bg-surface">
      <Photo src={src} alt="" contain={hasTransparency} />
    </div>
  )
}
