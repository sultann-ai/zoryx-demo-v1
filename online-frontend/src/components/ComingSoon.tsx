import { useT } from '../i18n'

/** Branded placeholder for routes whose real content arrives in later modules. */
export function ComingSoon({ title }: { title?: string }) {
  const { t } = useT()
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 text-center">
      <h1 className="text-3xl">{title ?? t('soon.title')}</h1>
      <p className="mt-4">{t('soon.body')}</p>
    </section>
  )
}
