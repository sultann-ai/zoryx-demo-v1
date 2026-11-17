// A covered serving dish with a little steam and sparkles: "all caught up, nothing waiting".
// Decorative only (the EmptyState title carries the meaning), drawn with the theme's tokens.
export function EmptyOrdersIllustration() {
  return (
    <svg viewBox="0 0 200 140" className="h-32 w-auto max-w-full" fill="none" aria-hidden="true">
      {/* soft backdrop */}
      <ellipse cx="100" cy="124" rx="78" ry="9" fill="var(--color-border)" opacity="0.7" />
      <circle cx="100" cy="68" r="56" fill="var(--color-chart-1-bg)" />

      {/* steam */}
      <g stroke="var(--color-ink-muted)" strokeWidth="2.5" strokeLinecap="round" opacity="0.55">
        <path d="M84 30c-5-5 5-9 0-15" />
        <path d="M100 26c-5-5 5-9 0-15" />
        <path d="M116 30c-5-5 5-9 0-15" />
      </g>

      {/* dish cover */}
      <path d="M46 98a54 54 0 0 1 108 0z" fill="var(--color-surface-raised)" stroke="var(--color-ink)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M62 86a40 40 0 0 1 22-26" stroke="var(--color-border)" strokeWidth="4" strokeLinecap="round" />
      <circle cx="100" cy="42" r="6" fill="var(--color-accent)" stroke="var(--color-ink)" strokeWidth="3" />

      {/* plate */}
      <rect x="34" y="98" width="132" height="10" rx="5" fill="var(--color-surface-raised)" stroke="var(--color-ink)" strokeWidth="3" />

      {/* sparkles */}
      <g fill="var(--color-accent)">
        <path d="M32 44l2.5 6.5L41 53l-6.5 2.5L32 62l-2.5-6.5L23 53l6.5-2.5z" />
        <path d="M170 58l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" opacity="0.7" />
        <circle cx="160" cy="30" r="3" opacity="0.5" />
      </g>
    </svg>
  );
}
