import type { ReactNode } from 'react'
import { useStore } from '../../api/store'
import { phoneHref, waHref } from '../../lib/config'
import { formatRs } from '../../lib/format'
import { pick } from '../../lib/localized'
import { isPlaceholderValue } from '../../lib/placeholders'
import { useShopMapUrl, useShopWhatsApp } from '../../lib/useShopContact'
import { useRevealOnce } from '../../lib/useRevealOnce'
import { useShopPhone } from '../../lib/useShopPhone'
import { useT, type TranslationKey } from '../../i18n'
import { Icon, type IconName } from '../Icon'
import { Skeleton } from '../Skeleton'
import { ButtonLink } from '../ui/Button'
import { FeatureCard } from '../ui/FeatureCard'
import { IconCircle } from '../ui/IconCircle'
import { TestimonialCard } from '../ui/TestimonialCard'
import { SectionHeader } from '../ui/SectionHeader'
import { Gallery } from './Gallery'

const container = 'mx-auto max-w-page'

// ---- Why Zoryx ----
// TODO(owner): the four claims behind these keys are placeholder wording (see the translation files). No invented claims.
const why: { icon: IconName; title: TranslationKey; body: TranslationKey }[] = [
  { icon: 'cup', title: 'why.1.title', body: 'why.1.body' },
  { icon: 'food', title: 'why.2.title', body: 'why.2.body' },
  { icon: 'truck', title: 'why.3.title', body: 'why.3.body' },
  { icon: 'sparkle', title: 'why.4.title', body: 'why.4.body' },
]

// A green band: forest background with .tone-dark (cream heading, lime accent word, lime icon circles). The four cards
// are equal height per row (grid stretch + h-full) and fade and rise in once, one after another, when scrolled to.
export function WhySection() {
  const { t } = useT()
  const reveal = useRevealOnce<HTMLUListElement>()
  return (
    <section data-band="forest" className="tone-dark">
      <div className={container}>
        <SectionHeader title={t('why.title')} accent={t('why.accent')} />
        <ul ref={reveal} className="grid grid-cols-1 gap-5 min-[560px]:grid-cols-2 lg:grid-cols-4">
          {why.map((card) => (
            <FeatureCard key={card.title} icon={card.icon} title={t(card.title)} body={t(card.body)} />
          ))}
        </ul>
      </div>
    </section>
  )
}

// ---- How to order ----
const steps: { icon: IconName; text: TranslationKey }[] = [
  { icon: 'food', text: 'how.1' },
  { icon: 'user', text: 'how.2' },
  { icon: 'cash', text: 'how.3' },
]

// Its band (cream or white) follows its position (BelowFold). Under 768px a vertical stepper (circle at the start, the text beside it); from 768px three columns. A dashed
// forest line joins the circles behind them (.how-step::after in index.css); on first scroll into view the steps rise
// in and the lines draw, in sequence. Static under reduced motion.
export function HowSection() {
  const { t } = useT()
  const reveal = useRevealOnce<HTMLOListElement>()
  return (
    <section>
      <div className={container}>
        <SectionHeader title={t('how.title')} accent={t('how.accent')} />
        <ol ref={reveal} className="how-steps grid md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.text} className="how-step relative flex items-start gap-4 md:flex-col md:items-center md:text-center">
              {/* 56px forest circle, cream icon; the lime number chip sits in its top corner, clear of the 24px icon,
                  with a forest ring so the lime never meets the cream page. */}
              <IconCircle icon={step.icon} size="lg" className="z-10">
                <span
                  dir="ltr"
                  className="num absolute -start-1.5 -top-1.5 flex size-[22px] items-center justify-center rounded-full bg-promo text-sm leading-none text-ink ring-2 ring-forest"
                >
                  {index + 1}
                </span>
              </IconCircle>
              <p className="pt-3 text-base font-bold text-balance text-ink md:pt-0">{t(step.text)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ---- Gallery strip: six rounded square photos ----
export function GallerySection() {
  const { t } = useT()
  const reveal = useRevealOnce<HTMLDivElement>()
  const { data, isPending } = useStore()
  if (!isPending && !data?.gallery.length) return null
  return (
    <section>
      <div ref={reveal} className={container}>
        <SectionHeader className="reveal-item" title={t('gallery.title')} accent={t('gallery.accent')} />
        {isPending ? (
          <div className="reveal-item grid grid-cols-3 gap-3 lg:grid-cols-6">
            {[0, 1, 2].map((n) => (
              <Skeleton key={n} className="aspect-square h-auto w-full" />
            ))}
          </div>
        ) : (
          <div className="reveal-item">
            <Gallery entries={(data?.gallery ?? []).slice(0, 6)} />
          </div>
        )}
      </div>
    </section>
  )
}

// ---- Testimonials: only the real ones from the store data (see ui/TestimonialCard) ----
// Its band follows its position (BelowFold). The layout follows the count: one review is centred at 640px at most; two sit in two columns (stacked under
// 560px); three or more are a 3-column grid from 1024px and, narrower, a native scroll-snap row (no JS, no arrows).
const reviewLayouts = {
  one: { list: 'mx-auto max-w-[640px]', item: '' },
  two: { list: 'grid gap-5 min-[560px]:grid-cols-2', item: '' },
  many: { list: 'snap-row lg:grid lg:grid-cols-3 lg:overflow-visible', item: 'w-[min(85%,340px)] shrink-0 lg:w-auto' },
}

export function ReviewsSection() {
  const { t, lang } = useT()
  const reveal = useRevealOnce<HTMLDivElement>()
  const { data, isPending } = useStore()
  if (!isPending && !data?.testimonials.length) return null
  const reviews = data?.testimonials ?? []
  const layout = reviews.length === 1 ? reviewLayouts.one : reviews.length === 2 ? reviewLayouts.two : reviewLayouts.many
  const scrolls = layout === reviewLayouts.many
  return (
    <section>
      <div ref={reveal} className={container}>
        <SectionHeader className="reveal-item" title={t('reviews.title')} accent={t('reviews.accent')} />
        {isPending ? (
          <div className="reveal-item flex gap-4 overflow-hidden">
            {[0, 1].map((n) => (
              <Skeleton key={n} className="h-36 w-72 shrink-0" />
            ))}
          </div>
        ) : (
          <ul
            className={`reveal-item ${layout.list}`}
            // A scroll row can be scrolled with the keyboard too: it takes focus (with its name) only while it scrolls.
            {...(scrolls ? { tabIndex: 0, 'aria-label': `${t('reviews.title')} ${t('reviews.accent')}` } : {})}
          >
            {reviews.map((review) => (
              <TestimonialCard
                key={review.id}
                className={layout.item}
                quote={pick(lang, review.text, review.textUr)}
                name={review.name}
                area={review.area}
                rating={review.rating}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

// ---- Find us ----
/** One info block of the Find us card: icon circle (forest, cream icon), a small uppercase label, then the value. */
function InfoBlock({ icon, label, children }: { icon: IconName; label?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <IconCircle icon={icon} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {label && <h3 className="eyebrow">{label}</h3>}
        <div className={label ? 'mt-1' : 'pt-2'}>{children}</div>
      </div>
    </div>
  )
}

/** A value the staff have not filled in yet ("Address coming soon"): a muted pill with a clock, so it reads as deliberate. */
function PendingPill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-band px-4 py-1.5 text-base text-muted ring-1 ring-ink/10">
      <Icon name="clock" className="size-5" />
      {text}
    </span>
  )
}

// Always the last band, so cream (BelowFold): one large white card (24px), address on the start side and opening hours (plus the delivery areas) on the
// end side from 768px, stacked below; then the actions: Call (primary), WhatsApp and Google Maps (secondary). No map embed.
export function FindSection() {
  const { t, lang } = useT()
  const { data, isPending } = useStore()
  const phone = useShopPhone()
  const whatsapp = useShopWhatsApp()
  const mapUrl = useShopMapUrl()
  const reveal = useRevealOnce<HTMLDivElement>()
  const settings = data?.settings
  const address = settings && pick(lang, settings.addressEn, settings.addressUr)
  const hours = settings && pick(lang, settings.openingHoursEn, settings.openingHoursUr)
  const areas = data?.deliveryAreas ?? []

  return (
    <section id="find">
      <div ref={reveal} className={container}>
        <SectionHeader className="reveal-item" title={t('find.title')} accent={t('find.accent')} />
        <div className="reveal-item rounded-panel border border-ink/10 bg-surface p-6 shadow-soft md:p-10">
          {isPending ? (
            <div className="grid gap-8 md:grid-cols-2" aria-hidden="true">
              {[0, 1].map((n) => (
                <div key={n} className="flex gap-4">
                  <Skeleton className="size-tap shrink-0 !rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-6 w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid gap-8 md:grid-cols-2 md:gap-12">
              <InfoBlock icon="pin" label={t('find.address')}>
                {isPlaceholderValue(address) ? (
                  address?.trim() && <PendingPill text={address} />
                ) : (
                  <p className="selectable text-lg">{address}</p>
                )}
              </InfoBlock>

              <div className="space-y-8">
                {/* Not filled in yet: the seeded text appears once, as the pill, with no "Opening hours" label above it. */}
                {isPlaceholderValue(hours) ? (
                  hours?.trim() && (
                    <InfoBlock icon="clock">
                      <PendingPill text={hours} />
                    </InfoBlock>
                  )
                ) : (
                  <InfoBlock icon="clock" label={t('find.hours')}>
                    <p className="selectable whitespace-pre-line text-lg">{hours}</p>
                  </InfoBlock>
                )}
                {areas.length > 0 && (
                  <InfoBlock icon="truck" label={t('find.delivery')}>
                    <ul className="divide-y divide-ink/10">
                      {areas.map((area) => (
                        <li key={area.id} className="flex items-center justify-between gap-3 py-2">
                          <span>{pick(lang, area.nameEn, area.nameUr)}</span>
                          <span dir="ltr" className="num text-ink">
                            {Number.parseFloat(area.deliveryFee) > 0 ? formatRs(area.deliveryFee) : t('find.free')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </InfoBlock>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stacked and full width (equal) on phones, inline from 768px. Every button is 48px tall. */}
        <div className="reveal-item mt-6 flex flex-col gap-3 md:flex-row md:flex-wrap">
          <ButtonLink href={phoneHref(phone)} className="w-full md:w-auto">
            <Icon name="phone" />
            <span className="whitespace-nowrap">{t('contact.call')}</span>
            <span dir="ltr" className="num whitespace-nowrap">
              {phone}
            </span>
          </ButtonLink>
          {whatsapp && (
            <ButtonLink href={waHref(whatsapp)} target="_blank" rel="noopener noreferrer" variant="secondary" className="w-full md:w-auto">
              <Icon name="whatsapp" />
              <span>{t('contact.whatsapp')}</span>
            </ButtonLink>
          )}
          {mapUrl && (
            <ButtonLink href={mapUrl} target="_blank" rel="noopener noreferrer" variant="secondary" className="w-full md:w-auto">
              <Icon name="pin" />
              <span>{t('find.map')}</span>
            </ButtonLink>
          )}
        </div>
      </div>
    </section>
  )
}
