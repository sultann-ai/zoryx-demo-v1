import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../../api/client'
import type { GalleryEntry } from '../../api/store'
import { pick } from '../../lib/localized'
import { useHistoryLayer } from '../../lib/useHistoryLayer'
import { useSheetLock } from '../../lib/useSheetLock'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { Button } from '../ui/Button'

/** Thumbnail grid (lazy) + a simple full-screen viewer on a native <dialog> (focus trap and Esc come for free). */
export function Gallery({ entries }: { entries: GalleryEntry[] }) {
  const { t, lang } = useT()
  const [index, setIndex] = useState<number | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useHistoryLayer(index !== null, () => setIndex(null))
  useSheetLock(index !== null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (index !== null && !element.open) element.showModal()
    if (index === null && element.open) element.close()
  }, [index])

  const step = (delta: number) =>
    setIndex((current) => (current === null ? null : (current + delta + entries.length) % entries.length))

  const current = index === null ? null : entries[index]
  const caption = current && pick(lang, current.captionEn, current.captionUr)

  return (
    <>
      <ul className="grid grid-cols-3 gap-3 md:gap-5 lg:grid-cols-6">
        {entries.map((entry, i) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-label={t('gallery.open')}
              className="block w-full overflow-hidden rounded-card shadow-soft"
            >
              <img
                src={apiUrl(entry.image.thumb)}
                alt={pick(lang, entry.captionEn, entry.captionUr) ?? ''}
                width={320}
                height={320}
                loading="lazy"
                decoding="async"
                className="aspect-square w-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialog}
        onClose={() => setIndex(null)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') step(document.dir === 'rtl' ? -1 : 1)
          if (event.key === 'ArrowLeft') step(document.dir === 'rtl' ? 1 : -1)
        }}
        className="tone-dark m-0 size-full max-h-none max-w-none bg-overlay/95 p-0 text-on-action backdrop:bg-ink"
      >
        {current && (
          <div className="flex size-full flex-col items-center justify-center gap-3 p-3">
            <img
              src={apiUrl(current.image.full)}
              alt={caption ?? ''}
              width={1000}
              height={750}
              className="max-h-[75svh] w-auto max-w-full object-contain"
            />
            {caption && <p className="text-center">{caption}</p>}
            <div className="flex items-center gap-4">
              <Button variant="icon" onClick={() => step(-1)} aria-label={t('gallery.prev')} className="!size-touch">
                <Icon name="arrow" className="size-7" mirror flip />
              </Button>
              <Button variant="secondary" onClick={() => setIndex(null)} aria-label={t('gallery.close')} className="!size-touch !min-h-0 !p-0 text-on-action">
                <Icon name="close" className="size-7" />
              </Button>
              <Button variant="icon" onClick={() => step(1)} aria-label={t('gallery.next')} className="!size-touch">
                <Icon name="arrow" className="size-7" mirror />
              </Button>
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
