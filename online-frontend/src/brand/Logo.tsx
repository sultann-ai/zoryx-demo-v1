
type Variant = 'primary' | 'reversed'

const FOREST = 'var(--color-action)'
const CREAM = 'var(--color-canvas)'
const LIME = 'var(--color-promo)'

/**
 * The Zoryx logo: rounded-square "Z" mark, a lowercase wordmark and a "DEMO" pill, all live (the pill is text, not artwork).
 * Sized by the font-size of `className` (everything inside is in em). "primary" is for cream/white backgrounds,
 * "reversed" for forest green / dark surfaces only. The wordmark is Latin in both page languages, as the logo is a fixed lockup.
 */
export function Logo({ className = '', variant = 'primary' }: { className?: string; variant?: Variant }) {
  const reversed = variant === 'reversed'
  return (
    <span className={`inline-flex items-center leading-none ${className}`} style={{ gap: '0.3em' }} aria-label="Zoryx demo">
      <LogoMark variant={variant} className="size-[1.3em]" />
      <span className="inline-flex items-start">
        <span
          className="font-serif"
          style={{ fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1, color: reversed ? CREAM : FOREST }}
        >
          zoryx
        </span>
        <span
          className="font-sans"
          style={{
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            fontSize: '0.34em',
            lineHeight: 1,
            padding: '0.45em 0.8em',
            marginInlineStart: '0.35em',
            borderRadius: '9999px',
            background: reversed ? LIME : FOREST,
            color: reversed ? FOREST : CREAM,
          }}
        >
          Demo
        </span>
      </span>
    </span>
  )
}

/** The mark only (app icon, favicon-style spots, photo stand-ins): a rounded square with the "Z". */
export function LogoMark({ className = '', variant = 'primary' }: { className?: string; variant?: Variant }) {
  const reversed = variant === 'reversed'
  const square = reversed ? CREAM : FOREST
  const bars = reversed ? FOREST : CREAM
  const diagonal = reversed ? FOREST : LIME
  return (
    <svg aria-hidden="true" viewBox="0 0 64 64" className={`shrink-0 ${className}`}>
      <rect width="64" height="64" rx="15" fill={square} />
      <rect x="16" y="15" width="32" height="8" rx="3" fill={bars} />
      <rect x="16" y="41" width="32" height="8" rx="3" fill={bars} />
      <path d="M44 23 L20 41" stroke={diagonal} strokeWidth="8" strokeLinecap="round" />
    </svg>
  )
}
