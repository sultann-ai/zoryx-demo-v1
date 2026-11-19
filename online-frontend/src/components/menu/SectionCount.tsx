import { useT } from '../../i18n'
import { Fill } from '../Fill'

/** "12 items" / "3 deals" under a section title (numbers go through <Fill> so they stay left-to-right in Urdu). */
export function SectionCount({ n, deals }: { n: number; deals: boolean }) {
  const { t } = useT()
  const key = deals ? (n === 1 ? 'menu.dealsCountOne' : 'menu.dealsCount') : n === 1 ? 'cats.countOne' : 'cats.count'
  return <Fill text={t(key)} values={{ n: String(n) }} />
}
