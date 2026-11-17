import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '../../../api/client'
import { useDeals } from '../../../api/deals'
import { useStore } from '../../../api/store'
import { formatRs } from '../../../lib/format'
import { pick } from '../../../lib/localized'
import { useT } from '../../../i18n'
import { Skeleton } from '../../Skeleton'

const SLIDE_HEIGHT = 'h-[168px]'

/**
 * Swipeable promo carousel on plain CSS scroll-snap (no library): the announcement (when staff set one) and the deals that
 * have photos. Hidden when there is nothing to show. The dots follow the slide in view and are real buttons (24px targets).
 * Swiping is the browser's own horizontal scroll, so it never fights the page's back gesture.
 */
export function PromoCarousel() {
  const { t, lang } = useT()
  const store = useStore()
  const deals = useDeals()
  const scroller = useRef<HTMLUListElement>(null)
  const [index, setIndex] = useState(0)

  const announcement = store.data && pick(lang, store.data.settings.announcementEn, store.data.settings.announcementUr)
  const withPhotos = (deals.data ?? []).filter((d) => d.orderable && d.image).slice(0, 5)
  const slideCount = (announcement ? 1 : 0) + withPhotos.length
  const pending = store.isPending || deals.isPending

  // The slide that is at least 60% in view is the current one (works the same in left-to-right and right-to-left).
  useEffect(() => {
    const root = scroller.current
    if (!root) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setIndex(Number((entry.target as HTMLElement).dataset.slide))
      },
      { root, threshold: 0.6 },
    )
    root.querySelectorAll('[data-slide]').forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [slideCount])

  // 168px slide + 4px gap + the 24px dots row: the section is the same height loading, loaded or (with one slide) without dots.
  if (pending) return <Skeleton className="h-[196px] w-full" />
  if (slideCount === 0) return null

  const goTo = (i: number) => {
    const slide = scroller.current?.querySelector<HTMLElement>(`[data-slide="${i}"]`)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    slide?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', inline: 'center', block: 'nearest' })
  }

  const first = announcement ? 1 : 0 // deals come after the announcement slide
  return (
    <section aria-roledescription="carousel" aria-label={t('offer.title')} className="-mx-4">
      <ul ref={scroller} className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-4">
        {announcement && (
          <li data-slide={0} className={`${SLIDE_HEIGHT} w-[85%] shrink-0 snap-center`}>
            <Link to="/menu" className="flex size-full flex-col justify-center gap-1 rounded-card bg-sunflower p-4 text-ink">
              <span className="font-serif text-2xl font-bold leading-tight">{t('offer.title')}</span>
              <span className="line-clamp-3 text-lg">{announcement}</span>
            </Link>
          </li>
        )}
        {withPhotos.map((deal, i) => {
          const name = pick(lang, deal.name, deal.nameUr) ?? deal.name
          return (
            <li key={deal.id} data-slide={first + i} className={`${SLIDE_HEIGHT} w-[85%] shrink-0 snap-center`}>
              <Link to="/menu?filter=deals" className="tone-dark relative block size-full overflow-hidden rounded-card bg-ink text-on-action">
                <img
                  src={apiUrl(deal.image!.thumb)}
                  alt=""
                  width={480}
                  height={168}
                  loading="lazy"
                  decoding="async"
                  className={`size-full ${deal.image!.hasTransparency ? 'bg-surface object-contain p-2' : 'object-cover'}`}
                />
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-overlay/90 via-overlay/30 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3">
                  <span className="min-w-0 truncate text-lg font-bold">{name}</span>
                  <span dir="ltr" className="shrink-0 rounded-full bg-surface px-3 text-lg font-bold text-ink">
                    {formatRs(deal.price)}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
      <div className="mt-1 flex h-6 justify-center">
        {slideCount > 1 &&
          Array.from({ length: slideCount }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={t('home.slide').replace('{n}', String(i + 1))}
              aria-current={i === index ? 'true' : undefined}
              className="flex size-6 items-center justify-center"
            >
              <span className={`block rounded-full transition-all ${i === index ? 'h-2 w-5 bg-action' : 'size-2 bg-ink/25'}`} />
            </button>
          ))}
      </div>
    </section>
  )
}
