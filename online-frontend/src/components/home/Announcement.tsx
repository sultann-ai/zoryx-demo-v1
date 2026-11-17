import { useStore } from '../../api/store'
import { pick } from '../../lib/localized'
import { useT } from '../../i18n'

/**
 * Banner for an announcement, only when staff have set one. It arrives with the store data, so on the home page it is an
 * `overlay` on the top of the hero (which leaves room for it): inserting it above the hero would push the whole page down.
 */
export function Announcement({ overlay = false }: { overlay?: boolean }) {
  const { lang } = useT()
  const { data } = useStore()
  const text = data && pick(lang, data.settings.announcementEn, data.settings.announcementUr)
  if (!text) return null
  return (
    <p className={`bg-sunflower px-4 py-2 text-center font-bold text-ink ${overlay ? 'absolute inset-x-0 top-0 z-10' : ''}`} role="status">
      {text}
    </p>
  )
}
