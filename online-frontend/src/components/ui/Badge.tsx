import { useT } from '../../i18n'
import { Icon, type IconName } from '../Icon'

type Kind = 'popular' | 'new' | 'deal'

const icons: Record<Kind, IconName | null> = { popular: 'sparkle', new: null, deal: 'bag' }

/** Ink text on every badge colour: sunflower 9.1:1, sky 6.6:1; the deal badge takes the surface's fill. */
const looks: Record<Kind, string> = { popular: 'bg-sunflower text-ink', new: 'bg-sky text-ink', deal: 'tone-fill' }

/** Popular (sunflower) / New (sky) / Deal (the surface's fill), each with a word and Popular with a sparkle: never colour alone. (A star would read as a rating, so Popular uses a sparkle.) */
export function Badge({ kind, className = '' }: { kind: Kind; className?: string }) {
  const { t } = useT()
  const label = kind === 'popular' ? t('menu.popular') : kind === 'new' ? t('menu.new') : t('menu.deal')
  const icon = icons[kind]
  return (
    <span className={`inline-flex items-center gap-1 ${looks[kind]} rounded-full px-3 py-0.5 text-xs font-bold uppercase tracking-wide ${className}`}>
      {icon && <Icon name={icon} className="size-4" />}
      {label}
    </span>
  )
}
