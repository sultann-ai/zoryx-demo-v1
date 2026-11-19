import type { ReactNode } from 'react'
import { Logo } from '../../brand/Logo'
import { phoneHref } from '../../lib/config'
import { useShopPhone } from '../../lib/useShopPhone'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { LanguageToggle } from '../LanguageToggle'

const roundButton =
  'relative inline-flex size-tap shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-soft transition-colors active:bg-band'

/**
 * Phone top bar: back button on inner screens, a small title (the brand on Home; on screens with a large title it
 * fades in once that has scrolled away), then the language toggle and a call button. Fixed, so the page needs
 * `padding-top: var(--header-h)`. The side padding is the notch inset in landscape (insets are physical by nature).
 */
export function AppBar({
  title,
  showTitle,
  onBack,
  call = true,
}: {
  /** null on Home, where the brand logo is the title. */
  title: ReactNode | null
  /** False while a large title is on screen under the bar. */
  showTitle: boolean
  /** Present on inner screens only. */
  onBack?: () => void
  /** The shop's call button. Off at a table, where "Call waiter" is the way to reach someone. */
  call?: boolean
}) {
  const { t } = useT()
  const phone = useShopPhone()
  return (
    <header
      id="appbar"
      className="fixed inset-x-0 top-0 z-30 bg-canvas/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)] backdrop-blur"
    >
      <div className="flex h-[56px] items-center gap-2 px-2 max-[359px]:gap-1 max-[359px]:px-1">
        {onBack && (
          <button type="button" onClick={onBack} aria-label={t('nav.back')} className={roundButton}>
            <Icon name="arrow" flip />
          </button>
        )}
        <div className={`min-w-0 flex-1 px-2 transition-opacity duration-[var(--dur-press)] ${showTitle ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!showTitle}>
          {title === null ? (
            <Logo className="min-w-0 text-xl max-[359px]:text-base" />
          ) : (
            <p className="truncate font-serif text-xl font-bold leading-tight text-ink">{title}</p>
          )}
        </div>
        <LanguageToggle />
        {call && (
          <a href={phoneHref(phone)} aria-label={`${t('contact.call')} ${phone}`} className={roundButton}>
            <Icon name="phone" />
          </a>
        )}
      </div>
    </header>
  )
}
