import type { IconName } from '../Icon'
import { IconCircle } from './IconCircle'

/**
 * A feature card for a green (.tone-dark) band: translucent cream with a hairline cream border, 20px, cream text; a 48px
 * lime icon circle with an ink icon, the title, one line of text. Full height of its grid row, so a row's cards match.
 * Pointer devices: the border brightens and the circle turns 6deg. `.reveal-item` lets the section stagger it in.
 */
export function FeatureCard({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <li className="feature-card reveal-item flex h-full flex-col items-start gap-2 p-6 text-start">
      <IconCircle icon={icon} aria-hidden="true" className="icon-circle-turn" />
      <h3 className="heading-sans mt-2 text-lg font-bold text-on-action">{title}</h3>
      <p className="text-base text-on-action">{body}</p>
    </li>
  )
}
