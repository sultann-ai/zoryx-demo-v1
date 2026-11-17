import { SlowHint } from './SlowHint'

/** Placeholder block shown while data or a route chunk loads. Reads on both the canvas and the band. */
export function Skeleton({ className = 'h-6 w-full' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-card bg-ink/10 ${className}`} />
}

export function PageSkeleton() {
  return (
    <div role="status" className="mx-auto min-h-svh w-full max-w-3xl space-y-4 px-4 py-8">
      <span className="sr-only">…</span>
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-6 w-5/6" />
      <Skeleton className="h-6 w-3/4" />
      <SlowHint />
    </div>
  )
}
