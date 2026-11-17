import { useEffect, useState } from 'react'
import type { CustomerStatus, OrderType } from '../../../api/orders'
import { useT, type TranslationKey } from '../../../i18n'
import { Icon, type IconName } from '../../Icon'

interface Step {
  status: CustomerStatus
  icon: IconName
  label: TranslationKey
}

/** Delivery: Received, Confirmed, Preparing, Ready, On the way, Delivered. Pickup: ... Ready for pickup, Collected. */
function stepsFor(type: OrderType): Step[] {
  const base: Step[] = [
    { status: 'RECEIVED', icon: 'cart', label: 'st.RECEIVED' },
    { status: 'CONFIRMED', icon: 'check', label: 'st.CONFIRMED' },
    { status: 'PREPARING', icon: 'food', label: 'st.PREPARING' },
  ]
  if (type === 'PICKUP') {
    return [...base, { status: 'READY', icon: 'store', label: 'st.READY_PICKUP' }, { status: 'DELIVERED', icon: 'home', label: 'st.DELIVERED_PICKUP' }]
  }
  return [
    ...base,
    { status: 'READY', icon: 'bag', label: 'st.READY' },
    { status: 'ON_THE_WAY', icon: 'truck', label: 'st.ON_THE_WAY' },
    { status: 'DELIVERED', icon: 'home', label: 'st.DELIVERED' },
  ]
}

/**
 * Vertical progress: a line that fills down to the current step (it animates in when the screen opens and each time the
 * status moves on), done steps with a check, the current step with a soft pulsing ring, the rest muted.
 */
export function StepProgress({ status, orderType }: { status: CustomerStatus; orderType: OrderType }) {
  const { t } = useT()
  const steps = stepsFor(orderType)
  const current = Math.max(0, steps.findIndex((s) => s.status === status))
  const finished = status === 'DELIVERED'
  // Start empty and grow to the real value after the first paint, so the line visibly fills.
  const target = steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0
  const [fill, setFill] = useState(0)
  useEffect(() => {
    const frame = requestAnimationFrame(() => setFill(target))
    return () => cancelAnimationFrame(frame)
  }, [target])

  return (
    <ol className="relative space-y-1">
      {/* The rail runs from the first to the last circle (centres 24px in); the fill is the same rail in success colour. */}
      <span aria-hidden="true" className="absolute inset-y-6 start-6 -ms-px w-0.5 rounded-full bg-ink/15" />
      <span
        aria-hidden="true"
        className="absolute start-6 top-6 -ms-px w-0.5 rounded-full bg-success transition-[height] duration-[var(--dur-fill)] ease-out"
        style={{ height: `calc((100% - 3rem) * ${fill / 100})` }}
      />
      {steps.map((step, i) => {
        const done = i < current || finished
        const now = i === current && !finished
        return (
          <li key={step.status} aria-current={now ? 'step' : undefined} className="relative flex min-h-12 items-center gap-4">
            <span
              className={`z-10 flex size-12 shrink-0 items-center justify-center rounded-full transition-colors duration-[var(--dur-page)] ${
                done ? 'bg-success text-on-action' : now ? 'step-now border-2 border-ink bg-surface text-ink' : 'bg-band text-muted'
              }`}
            >
              <Icon name={done ? 'check' : step.icon} className="size-6" />
            </span>
            <span className={`text-xl ${now ? 'font-bold text-ink' : done ? 'font-bold text-ink' : 'text-muted'}`}>{t(step.label)}</span>
          </li>
        )
      })}
    </ol>
  )
}
