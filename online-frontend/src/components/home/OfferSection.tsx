import { useDeals } from '../../api/deals'
import { apiUrl } from '../../api/client'
import { useStore } from '../../api/store'
import { formatRs } from '../../lib/format'
import { pick } from '../../lib/localized'
import { useRevealOnce } from '../../lib/useRevealOnce'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { ButtonRoute } from '../ui/Button'
import { HandCircle } from '../ui/HandCircle'

/**
 * The special-offer banner: serif title, the announcement text (or the deal's description), an orange pill and, on the other
 * side, the first deal that has a photo with a hand-drawn promo circle around its price. A soft wave at the bottom hands over
 * to the next section's background (--next-bg, set per position in index.css).
 * Hidden when there is neither an announcement nor a deal photo.
 */
export function OfferSection() {
  const { t, lang } = useT()
  const store = useStore()
  const deals = useDeals()
  const reveal = useRevealOnce<HTMLDivElement>()
  const announcement = store.data && pick(lang, store.data.settings.announcementEn, store.data.settings.announcementUr)
  const deal = deals.data?.find((d) => d.orderable && d.image) ?? null
  if (!announcement && !deal) return null

  const dealName = deal && (pick(lang, deal.name, deal.nameUr) ?? deal.name)
  const body = announcement ?? (deal && (pick(lang, deal.description, deal.descriptionUr) ?? dealName))
  const image = deal?.image

  return (
    <section className="offer relative overflow-hidden">
      <div ref={reveal} className={`mx-auto grid max-w-page items-center gap-10 ${image ? 'md:grid-cols-2' : ''}`}>
        <div className={`reveal-item flex flex-col items-start gap-4 ${image ? '' : 'mx-auto max-w-2xl text-center md:items-center'}`}>
          <h2 className="text-h2">{t('offer.title')}</h2>
          {body && <p className="max-w-md text-xl text-muted">{body}</p>}
          {deal && <p className="text-xl font-bold">{dealName}</p>}
          <ButtonRoute to={{ pathname: '/menu', hash: deal ? '#sec-deals' : '' }} className="mt-1">
            <Icon name="bag" className="size-6" />
            <span>{t('nav.orderNow')}</span>
          </ButtonRoute>
        </div>
        {image && deal && (
          <div className="reveal-item relative">
            <img
              src={apiUrl(image.full)}
              srcSet={`${apiUrl(image.thumb)} 480w, ${apiUrl(image.full)} 1000w`}
              sizes="(min-width: 768px) 560px, 92vw"
              alt={dealName ?? ''}
              width={1000}
              height={750}
              loading="lazy"
              decoding="async"
              className={`aspect-[4/3] w-full ${image.hasTransparency ? 'object-contain' : 'rounded-card object-cover shadow-soft'}`}
            />
            {/* The circle is drawn around the deal price. Decorative: the price keeps its own text. */}
            <span dir="ltr" className="absolute -top-4 start-2 z-10 rounded-full bg-surface px-3 py-3 text-2xl font-bold text-ink shadow-soft md:-start-4">
              <HandCircle>{formatRs(deal.price)}</HandCircle>
            </span>
          </div>
        )}
      </div>
      {/* Soft wave edge */}
      <svg
        viewBox="0 0 1200 40"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -bottom-px h-6 w-full text-[var(--next-bg)] md:h-10"
      >
        <path d="M0 40V22C150 2 300 2 450 16s300 24 450 8 220-18 300-6v20H0Z" fill="currentColor" />
      </svg>
    </section>
  )
}
