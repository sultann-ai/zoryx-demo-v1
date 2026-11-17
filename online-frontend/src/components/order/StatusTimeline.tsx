import type { CustomerStatus } from '../../api/orders'
import { useT, type TranslationKey } from '../../i18n'
import { Icon, type IconName } from '../Icon'

const steps: { id: 'RECEIVED' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'DELIVERED'; icon: IconName }[] = [
  { id: 'RECEIVED', icon: 'cart' },
  { id: 'CONFIRMED', icon: 'check' },
  { id: 'PREPARING', icon: 'food' },
  { id: 'READY', icon: 'truck' },
  { id: 'DELIVERED', icon: 'home' },
]

// ON_THE_WAY is the "Ready" step in its later stage; it keeps the five-step shape but changes the label.
const indexOf = (status: CustomerStatus): number =>
  status === 'ON_THE_WAY' ? 3 : Math.max(0, steps.findIndex((s) => s.id === status))

/** Vertical timeline of circles: done = success with a check, current = sunflower ring, upcoming = muted. */
export function StatusTimeline({ status }: { status: CustomerStatus }) {
  const { t } = useT()
  const current = indexOf(status)
  const finished = status === 'DELIVERED'
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => {
        const done = i < current || finished
        const now = i === current && !finished
        const label: TranslationKey = step.id === 'READY' && status === 'ON_THE_WAY' ? 'st.ON_THE_WAY' : (`st.${step.id}` as TranslationKey)
        return (
          <li key={step.id} aria-current={now ? 'step' : undefined} className="relative flex items-center gap-4 py-2">
            {i < steps.length - 1 && (
              <span aria-hidden="true" className={`absolute start-6 top-12 -ms-px h-6 w-0.5 ${i < current || finished ? 'bg-success' : 'bg-ink/20'}`} />
            )}
            <span
              className={`z-10 flex size-tap shrink-0 items-center justify-center rounded-full ${
                done
                  ? 'bg-success text-on-action'
                  : now
                    ? 'border-2 border-ink bg-surface text-ink ring-4 ring-sunflower'
                    : 'bg-band text-muted'
              }`}
            >
              <Icon name={done ? 'check' : step.icon} className="size-6" />
            </span>
            <span className={`text-xl ${now ? 'font-bold text-ink' : done ? 'font-bold' : 'text-muted'}`}>{t(label)}</span>
          </li>
        )
      })}
    </ol>
  )
}
