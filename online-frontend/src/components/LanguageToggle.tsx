import { useT } from '../i18n'

// The phone app bar's look; the website header passes its own (the round .icon-btn) through `className`.
const DEFAULT_LOOK =
  'inline-flex h-tap min-w-tap shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-surface px-3 text-base font-bold leading-none text-ink shadow-soft transition-colors hover:bg-band motion-safe:active:scale-95'

/** Always-visible switch: a round button showing the language you would switch TO, written in that language. */
export function LanguageToggle({ className = DEFAULT_LOOK }: { className?: string }) {
  const { t, lang, setLang } = useT()
  return (
    <button
      type="button"
      onClick={() => setLang(lang === 'ur' ? 'en' : 'ur')}
      aria-label={t('nav.langSwitchLabel')}
      lang={lang === 'ur' ? 'en' : 'ur'}
      className={className}
    >
      {/* Below 360px the long "English" label would squeeze the logo: a short code is shown instead. */}
      <span className="max-[359px]:hidden">{t('nav.langSwitch')}</span>
      <span className="hidden max-[359px]:inline">{lang === 'ur' ? 'EN' : t('nav.langSwitch')}</span>
    </button>
  )
}
