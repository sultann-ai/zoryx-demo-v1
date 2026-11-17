import type { ReactNode } from 'react'
import { LogoMark } from '../../brand/Logo'
import { useT } from '../../i18n'
import { Icon, type IconName } from '../Icon'

/**
 * A full-screen state in the app style (offline, error, empty, closed, not found): a round icon, a short title, one
 * calm sentence and the actions, centred in the space between the bars. Always plain words, never a bare error code.
 */
export function AppState({
  icon,
  title,
  body,
  tone = 'neutral',
  role,
  compact = false,
  children,
}: {
  icon: IconName
  title: string
  body?: ReactNode
  tone?: 'neutral' | 'warning'
  role?: 'alert' | 'status'
  /** Inside a sheet: no full-height centring. */
  compact?: boolean
  children?: ReactNode
}) {
  return (
    <section role={role} className={`mx-auto flex max-w-md flex-col ${compact ? 'py-4' : 'min-h-[calc(100dvh-var(--header-h)-var(--tabbar-h)-2rem)] py-8'} items-center justify-center gap-4 px-6 text-center`}>
      <span className={`flex size-24 items-center justify-center rounded-full ${tone === 'warning' ? 'bg-accent/10 text-accent' : 'bg-band text-ink'}`}>
        <Icon name={icon} className="size-12" />
      </span>
      <h1 className="text-3xl leading-tight">{title}</h1>
      {body && <p className="text-lg text-muted">{body}</p>}
      {children && <div className="flex w-full flex-col gap-3 pt-2">{children}</div>}
    </section>
  )
}

/** The loading splash: the brand mark breathing, with a quiet "one moment". Shown while a screen's code or data first arrives. */
export function Splash() {
  const { t } = useT()
  return (
    <div role="status" className="flex min-h-[calc(100dvh-var(--header-h)-var(--tabbar-h))] flex-col items-center justify-center gap-4">
      <LogoMark className="splash-mark size-24 text-5xl shadow-soft" />
      <p className="text-lg text-muted">{t('loading')}</p>
    </div>
  )
}
