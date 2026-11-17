import { lazy, Suspense, useRef } from 'react'
import { Announcement } from '../components/home/Announcement'
import { Hero } from '../components/home/Hero'
import { StickyOrderBar } from '../components/home/StickyOrderBar'
import { Skeleton } from '../components/Skeleton'
import { useIsPhone } from '../lib/useAppMode'

// Everything under the hero loads after it, in its own chunk, so the first screen needs less JavaScript.
const BelowFold = lazy(() => import('../components/home/BelowFold'))

// Phones get a different Home (header card, quick actions, carousel, snap rows), in its own chunk.
const loadMobileHome = () => import('../components/mobile/home/MobileHome')
const MobileHome = lazy(loadMobileHome)
// Start fetching it right away when a phone opens the site on Home, in parallel with the app code (not on /menu, which does not need it).
if (window.location.pathname === '/' && typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 767px)').matches) void loadMobileHome()

/** Holds the size of the phone header card and quick actions while the chunk arrives, so nothing shifts when it does. */
function MobileHomeSkeleton() {
  return (
    <div className="space-y-6 px-4 pb-6 pt-2" aria-hidden="true">
      <Skeleton className="h-[200px] w-full" />
      <Skeleton className="h-[88px] w-full" />
      <Skeleton className="h-[196px] w-full" />
    </div>
  )
}

export default function Home() {
  const heroRef = useRef<HTMLElement>(null)
  const phone = useIsPhone()
  if (phone) {
    return (
      <Suspense fallback={<MobileHomeSkeleton />}>
        <MobileHome />
      </Suspense>
    )
  }
  return (
    <>
      <div className="relative">
        <Announcement overlay />
        <Hero ref={heroRef} />
      </div>
      {/* The band rhythm is in BelowFold. While its chunk loads, a screen-high placeholder keeps the footer below the
          fold, so its arrival never pushes a visible footer down (layout shift on wide screens, where the hero is short). */}
      <Suspense fallback={<div className="min-h-svh" aria-hidden="true" />}>
        <BelowFold />
      </Suspense>
      <StickyOrderBar heroRef={heroRef} />
    </>
  )
}
