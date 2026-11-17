import { useT } from '../../i18n'
import { Icon } from '../Icon'

/** Sunflower stars with an ink outline (visible on cream as well as white); empty ones are the outline alone. The rating
 *  is read out as text ("4 / 5 stars"), the stars themselves are hidden from screen readers. */
function Stars({ rating }: { rating: number }) {
  const { t } = useT()
  const value = Math.max(0, Math.min(5, Math.round(rating)))
  return (
    <p className="relative z-10 flex">
      <span className="sr-only">{`${value} / 5 ${t('reviews.stars')}`}</span>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          key={n}
          name="star"
          aria-hidden="true"
          strokeLinejoin="round"
          className={`size-5 stroke-ink stroke-[1.5] ${n <= value ? 'text-sunflower' : 'text-transparent'}`}
        />
      ))}
    </p>
  )
}

/**
 * Cream card, 20px, a hairline ink border (so it also stands out on the cream phone page), a large decorative sunflower
 * quotation mark in the top-end corner behind the text. Stars (only when the testimonial itself carries a rating: never a
 * made-up score), the quote in DM Sans 500 18px, then a forest circle with the cream initial, the name and the area.
 * The initial is derived from the name (no photos, no "verified customer" claims). Full height of its grid row.
 */
export function TestimonialCard({
  quote,
  name,
  area,
  rating,
  className = '',
}: {
  quote: string | null
  name: string
  area?: string | null
  rating: number | null
  className?: string
}) {
  const initial = Array.from(name.trim())[0] ?? ''
  return (
    <li className={`relative flex flex-col gap-3 overflow-hidden rounded-card border border-ink/10 bg-canvas p-6 text-ink ${className}`}>
      {/* A div, not a span: the Urdu line-height rule (2 on p/span/...) would push a 96px glyph halfway down the card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-2 end-4 select-none font-serif text-[96px] leading-none text-sunflower"
      >
        “
      </div>
      {rating !== null && <Stars rating={rating} />}
      {quote && <p className="relative z-10 text-base font-medium">{quote}</p>}
      <div className="relative z-10 mt-auto flex items-center gap-3 pt-2">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-full bg-action font-bold text-on-action">
          {initial}
        </span>
        <p className="min-w-0 font-bold leading-snug text-ink">
          {name}
          {area && <span className="block text-base font-normal text-muted">{area}</span>}
        </p>
      </div>
    </li>
  )
}
