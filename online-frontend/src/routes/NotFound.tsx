import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useT } from '../i18n'

export default function NotFound() {
  const { t } = useT()
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 text-center">
      <h1 className="text-3xl">{t('notFound.title')}</h1>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-touch items-center gap-2 rounded-full bg-action px-6 font-bold text-on-action"
      >
        <Icon name="home" />
        <span>{t('notFound.body')}</span>
      </Link>
    </section>
  )
}
