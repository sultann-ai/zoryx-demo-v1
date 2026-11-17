import { useStore } from '../../api/store'
import { pick } from '../../lib/localized'
import { useShopMapUrl } from '../../lib/useShopContact'
import { useT } from '../../i18n'
import { Icon } from '../Icon'
import { ButtonLink } from '../ui/Button'

/** Where to collect: the shop's address, a map button and the pickup note, all from the public store content. */
export function PickupInfo({
  address,
  mapUrl,
  note,
  className = '',
}: {
  address?: string | null
  mapUrl?: string | null
  note?: string | null
  className?: string
}) {
  const { t } = useT()
  if (!address && !mapUrl && !note) return null
  return (
    <div className={`space-y-3 card p-4 text-ink ${className}`}>
      <p className="flex items-center gap-2 font-bold text-ink">
        <Icon name="store" />
        {t('order.collectFrom')}
      </p>
      {address && (
        <p className="flex items-start gap-2 text-lg">
          <Icon name="pin" className="mt-2 size-6 text-accent" />
          <span>{address}</span>
        </p>
      )}
      {note && <p className="font-bold text-ink">{note}</p>}
      {mapUrl && (
        <ButtonLink href={mapUrl} target="_blank" rel="noopener noreferrer" className="w-full">
          <Icon name="pin" />
          <span>{t('find.map')}</span>
        </ButtonLink>
      )}
    </div>
  )
}

/** The shop details for a pickup order at checkout, read from the store endpoint in the current language. */
export function StorePickupInfo() {
  const { lang } = useT()
  const settings = useStore().data?.settings
  const mapUrl = useShopMapUrl()
  if (!settings) return null
  return (
    <PickupInfo
      address={pick(lang, settings.addressEn, settings.addressUr)}
      mapUrl={mapUrl}
      note={pick(lang, settings.pickupNoteEn, settings.pickupNoteUr)}
    />
  )
}
