import { useT } from '../../i18n'
import { formatRs } from '../../lib/format'

/** "Rs 1,450": DM Sans 700 with tabular figures (.num), ink, Western digits, always left-to-right. `from` adds a small "from" line for sized items. */
export function PriceTag({ amount, from = false, className = '' }: { amount: string | number; from?: boolean; className?: string }) {
  const { t } = useT()
  return (
    <p className={`font-bold leading-tight text-ink ${className}`}>
      {from && <span className="block text-sm font-normal text-muted">{t('popular.from')}</span>}
      <span dir="ltr" className="num whitespace-nowrap text-lg md:text-xl">
        {formatRs(amount)}
      </span>
    </p>
  )
}
