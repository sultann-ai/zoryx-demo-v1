import { lazy, Suspense } from 'react'
import { useStore } from '../../../api/store'
import { phoneHref } from '../../../lib/config'
import { formatRs } from '../../../lib/format'
import { pick } from '../../../lib/localized'
import { useShopMapUrl } from '../../../lib/useShopContact'
import { useShopPhone } from '../../../lib/useShopPhone'
import { useT, type TranslationKey } from '../../../i18n'
import { Fill } from '../../Fill'
import { Icon, type IconName } from '../../Icon'
import { Skeleton } from '../../Skeleton'
import { ButtonLink } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { TestimonialCard } from '../../ui/TestimonialCard'
import { RowHeader } from './Rows'

const VISIBLE_AREAS = 3

// The photo viewer is only needed once someone looks at the gallery, so it is its own chunk.
const Gallery = lazy(() => import('../../home/Gallery').then((m) => ({ default: m.Gallery })))

/** Compact "Find us": address, hours, delivery areas with their fees, and call / map buttons. */
export function FindCard() {
  const { t, lang } = useT()
  const { data, isPending } = useStore()
  const phone = useShopPhone()
  const mapUrl = useShopMapUrl()
  if (isPending) return <Skeleton className="h-[320px] w-full" />
  const settings = data?.settings
  const address = settings && pick(lang, settings.addressEn, settings.addressUr)
  const hours = settings && pick(lang, settings.openingHoursEn, settings.openingHoursUr)
  const areas = data?.deliveryAreas ?? []
  const first = areas.slice(0, VISIBLE_AREAS)
  const rest = areas.slice(VISIBLE_AREAS)
  const areaRow = (area: (typeof areas)[number]) => (
    <li key={area.id} className="flex items-center justify-between gap-3 py-1">
      <span>{pick(lang, area.nameEn, area.nameUr)}</span>
      <span dir="ltr" className="font-bold text-ink">
        {Number.parseFloat(area.deliveryFee) > 0 ? formatRs(area.deliveryFee) : t('find.free')}
      </span>
    </li>
  )
  return (
    <section id="find" aria-labelledby="find-h" className="scroll-mt-[calc(var(--header-h)+0.5rem)]">
      <RowHeader title={`${t('find.title')} ${t('find.accent')}`} />
      <span id="find-h" className="sr-only">
        {t('find.title')} {t('find.accent')}
      </span>
      <Card className="space-y-3 p-4">
        {address && (
          <p className="flex items-start gap-3">
            <Icon name="pin" className="mt-2 text-accent" />
            <span className="selectable">{address}</span>
          </p>
        )}
        {hours && (
          <p className="flex items-start gap-3">
            <Icon name="clock" className="mt-2 text-accent" />
            <span className="selectable whitespace-pre-line">{hours}</span>
          </p>
        )}
        {areas.length > 0 && (
          <div>
            <p className="flex items-center gap-2 font-bold text-ink">
              <Icon name="truck" className="text-accent" />
              {t('find.delivery')}
            </p>
            <ul className="divide-y divide-ink/10">
              {first.map(areaRow)}
            </ul>
            {rest.length > 0 && (
              <details className="group">
                <summary className="flex min-h-touch cursor-pointer list-none items-center gap-1 font-bold text-accent">
                  <Fill text={t('home.moreAreas')} values={{ n: String(rest.length) }} />
                  <Icon name="arrow" className="size-5 rotate-90 transition-transform group-open:-rotate-90" />
                </summary>
                <ul className="divide-y divide-ink/10">{rest.map(areaRow)}</ul>
              </details>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <ButtonLink href={phoneHref(phone)} className="!px-2">
            <Icon name="phone" />
            <span>{t('home.qa.call')}</span>
          </ButtonLink>
          {mapUrl && (
            <ButtonLink href={mapUrl} target="_blank" rel="noopener noreferrer" variant="secondary" className="!px-2">
              <Icon name="pin" />
              <span>{t('home.qa.directions')}</span>
            </ButtonLink>
          )}
        </div>
      </Card>
    </section>
  )
}

/** Only real testimonials from the store data (never invented), as a snap row. */
export function ReviewsRow() {
  const { t, lang } = useT()
  const { data, isPending } = useStore()
  if (isPending) return <Skeleton className="h-[176px] w-full" />
  if (!data?.testimonials.length) return null
  return (
    <section>
      <RowHeader title={`${t('reviews.title')} ${t('reviews.accent')}`} />
      <ul className="snap-row -mx-4 px-4">
        {data.testimonials.map((review) => (
          <TestimonialCard
            key={review.id}
            className="w-72 shrink-0"
            quote={pick(lang, review.text, review.textUr)}
            name={review.name}
            area={review.area}
            rating={review.rating}
          />
        ))}
      </ul>
    </section>
  )
}

/** A small photo grid (the first six); a tap opens the viewer. */
export function GalleryGrid() {
  const { t } = useT()
  const { data, isPending } = useStore()
  if (isPending) return <Skeleton className="h-[200px] w-full" />
  if (!data?.gallery.length) return null
  return (
    <section>
      <RowHeader title={`${t('gallery.title')} ${t('gallery.accent')}`} />
      <Suspense fallback={<Skeleton className="h-[200px] w-full" />}>
        <Gallery entries={data.gallery.slice(0, 6)} />
      </Suspense>
    </section>
  )
}

const steps: { icon: IconName; text: TranslationKey }[] = [
  { icon: 'food', text: 'how.1' },
  { icon: 'user', text: 'how.2' },
  { icon: 'cash', text: 'how.3' },
]

/** The long "why choose us" and "how to order" blocks become one collapsed card with three icon steps. */
export function HowCard() {
  const { t } = useT()
  return (
    <Card as="details" className="group p-4">
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 font-serif text-xl font-bold text-ink">
        <span>
          {t('how.title')} {t('how.accent')}
        </span>
        <Icon name="arrow" className="rotate-90 transition-transform group-open:-rotate-90" />
      </summary>
      <ol className="mt-3 space-y-3">
        {steps.map((step, i) => (
          <li key={step.text} className="flex items-center gap-3">
            <span className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-action text-on-action">
              <Icon name={step.icon} />
              <span dir="ltr" className="absolute -start-1 -top-1 flex size-6 items-center justify-center rounded-full bg-ink text-sm font-bold text-on-action">
                {i + 1}
              </span>
            </span>
            <span className="font-bold text-ink">{t(step.text)}</span>
          </li>
        ))}
      </ol>
    </Card>
  )
}
