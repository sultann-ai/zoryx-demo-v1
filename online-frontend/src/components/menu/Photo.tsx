import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../../api/client'
import { PhotoPlaceholder } from '../ui/PhotoPlaceholder'

/**
 * 4:3 thumbnail, lazy, object-fit cover (a cut-out is shown whole). The placeholder wash is there from the first paint and
 * the photo fades in over it once it has loaded (so a slow image never pops in); with no photo, or one that fails to load,
 * the designed placeholder (PhotoPlaceholder) shows instead: never a broken image. Alt text is the item name.
 */
export function Photo({
  src,
  alt,
  width = 320,
  height = 240,
  className = '',
  priority = false,
  contain = false,
}: {
  src: string | null | undefined
  alt: string
  width?: number
  height?: number
  className?: string
  /** First photos on the screen: load now, not lazily (they are the likely LCP). */
  priority?: boolean
  /** A cut-out photo (transparent background): show it whole on white instead of cropping it to fill the box. */
  contain?: boolean
}) {
  const fill = /(^| )w-/.test(className) ? '' : 'w-full'
  const [loaded, setLoaded] = useState(false)
  // Remembers which src failed, so a new src gets its own chance to load.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = !!src && failedSrc === src
  const image = useRef<HTMLImageElement>(null)
  // An image that is already in the cache can finish before React has attached onLoad.
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) setLoaded(true)
  }, [src])
  if (!src || broken) {
    return <PhotoPlaceholder className={`${fill} ${className}`} />
  }
  return (
    <div className={`photo-placeholder relative aspect-[4/3] overflow-hidden ${fill} ${className}`}>
      <img
        ref={image}
        src={apiUrl(src)}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setFailedSrc(src)}
        className={`absolute inset-0 size-full transition-opacity duration-[var(--dur-sheet)] ${loaded ? 'opacity-100' : 'opacity-0'} ${contain ? 'bg-surface object-contain p-2' : 'object-cover'}`}
      />
    </div>
  )
}
