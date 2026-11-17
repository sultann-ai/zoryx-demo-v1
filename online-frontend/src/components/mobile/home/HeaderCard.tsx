import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../../../api/store'
import { pick } from '../../../lib/localized'
import { useT } from '../../../i18n'
import { Icon } from '../../Icon'
import { StatusChip } from '../../ui/StatusChip'

// Files the owner drops into public/media/ (see README). Neither is required: without them the card is a plain brand panel.
const VIDEO_SRC = '/media/drone.mp4'
const POSTER_SRC = '/media/drone-poster.jpg'

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

/** May the video start by itself? Not with reduced motion, data saver, or a slow connection (2G/3G). */
function mayAutoplay(): boolean {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
  if (connection?.saveData) return false
  if (connection?.effectiveType && ['slow-2g', '2g', '3g'].includes(connection.effectiveType)) return false
  return true
}

/**
 * The drone loop behind the header card. Smart loading:
 * - the poster paints first; the video file is not requested until the page has loaded and the card is on screen;
 * - no autoplay on reduced motion, data saver or a slow connection (the play button starts it on request);
 * - it plays only while at least half of the card is visible and the tab is in front, and pauses otherwise.
 * Decorative (muted, no sound), but with a real play / pause button.
 */
function DroneVideo() {
  const { t } = useT()
  const box = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const [auto] = useState(mayAutoplay)
  const [posterOk, setPosterOk] = useState(true)
  const [failed, setFailed] = useState(false)
  const [wantSrc, setWantSrc] = useState(false) // start fetching the file
  const [playing, setPlaying] = useState(false)
  const visible = useRef(false)
  const userPaused = useRef(!auto) // starts "paused by choice" when autoplay is not allowed

  const sync = useCallback(() => {
    const el = video.current
    if (!el) return
    if (visible.current && !userPaused.current && !document.hidden) void el.play().catch(() => {})
    else el.pause()
  }, [])

  // Fetch the video only after the page has loaded (the poster is the LCP, the video must never compete with it).
  useEffect(() => {
    if (!auto) return
    const start = () => setWantSrc(true)
    if (document.readyState === 'complete') {
      const id = window.setTimeout(start, 300)
      return () => clearTimeout(id)
    }
    window.addEventListener('load', start, { once: true })
    return () => window.removeEventListener('load', start)
  }, [auto])

  // The source is attached on this render; with preload="none" nothing loads (or fires canplay) until play() is called again.
  useEffect(() => {
    if (wantSrc) sync()
  }, [wantSrc, sync])

  // Play while at least half of the card is on screen; pause when it scrolls away or the tab is hidden.
  useEffect(() => {
    const node = box.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible.current = entry.isIntersecting
        sync()
      },
      { threshold: 0.5 },
    )
    observer.observe(node)
    document.addEventListener('visibilitychange', sync)
    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', sync)
    }
  }, [sync])

  const toggle = () => {
    if (playing) {
      userPaused.current = true
      sync()
      return
    }
    userPaused.current = false
    setWantSrc(true) // a deliberate tap starts the download even when autoplay was not allowed
    visible.current = true
    // The element may only get its src on this render: play() once it is attached.
    requestAnimationFrame(sync)
  }

  return (
    <div ref={box} className="absolute inset-0">
      {posterOk && (
        <img
          src={POSTER_SRC}
          alt=""
          width={800}
          height={400}
          decoding="async"
          fetchPriority="high"
          onError={() => setPosterOk(false)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      {!failed && (
        <video
          ref={video}
          src={wantSrc ? VIDEO_SRC : undefined}
          muted
          loop
          playsInline
          preload="none"
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onCanPlay={sync}
          onError={() => wantSrc && setFailed(true)}
          className={`absolute inset-0 size-full object-cover transition-opacity duration-[var(--dur-page)] ${playing ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {!failed && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? t('home.video.pause') : t('home.video.play')}
          className="absolute bottom-2 end-2 z-10 flex size-tap items-center justify-center rounded-full bg-overlay/70 text-on-action"
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
      )}
    </div>
  )
}

/**
 * The compact header card that replaces the big hero on phones: a 200px, 16px-rounded panel with the drone video,
 * a readable dark overlay, the shop name, tagline and the open / closed chip. The height is fixed so nothing shifts.
 */
export function HeaderCard() {
  const { t, lang } = useT()
  const { data } = useStore()
  const name = pick(lang, data?.settings.shopNameEn, data?.settings.shopNameUr) ?? t('brand.name')
  const tagline = pick(lang, data?.settings.taglineEn, data?.settings.taglineUr) ?? t('brand.tagline')
  return (
    <section className="tone-dark relative h-[200px] overflow-hidden rounded-card bg-ink text-on-action">
      <DroneVideo />
      {/* Readable text over any footage: dark at the bottom where the words are, light at the top. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-overlay/95 via-overlay/60 to-overlay/20" />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-1 p-4 pe-16">
        <h1 className="text-3xl leading-tight">{name}</h1>
        <p className="text-lg">{tagline}</p>
      </div>
      <div className="absolute start-3 top-3">
        <StatusChip />
      </div>
    </section>
  )
}
