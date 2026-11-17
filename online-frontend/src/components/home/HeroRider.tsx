import { useState } from 'react'

/**
 * The rider cut-out (a transparent PNG) standing on the hero panel. It slides up once, then floats gently.
 * The file is public/media/rider.png: if it is missing or fails to load nothing is shown (no broken-image icon).
 * Decorative, so no alt text. Absolutely positioned, so it can never shift the layout. On md+ it rises above the panel's top edge.
 */
export function HeroRider() {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return (
    <div aria-hidden="true" className="rider-float pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-full justify-center md:h-[120%]">
      <img
        src="/media/rider.png"
        alt=""
        width={900}
        height={900}
        decoding="async"
        fetchPriority="low"
        onError={() => setOk(false)}
        className="rider-in h-full w-auto max-w-[94%] object-contain object-bottom"
      />
    </div>
  )
}
