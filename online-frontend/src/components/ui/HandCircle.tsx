import type { ReactNode } from 'react'

/** A hand-drawn looking ring around a word, in the surface's accent colour (tomato on light, lime inside .tone-dark). Decorative: the word keeps its own text. */
export function HandCircle({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-block px-3">
      {children}
      <svg
        viewBox="0 0 120 50"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full overflow-visible tone-accent"
      >
        <path
          d="M8 28 C 4 10, 40 2, 66 4 C 100 6, 118 16, 112 30 C 106 44, 70 48, 42 46 C 16 44, 6 36, 12 22"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  )
}
