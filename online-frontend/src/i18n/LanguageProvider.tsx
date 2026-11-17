import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { en } from './en'
import { LanguageContext, type Lang } from './context'
import { ur, type TranslationKey } from './ur'

const STORAGE_KEY = 'mc.lang'
const dictionaries: Record<Lang, Record<TranslationKey, string>> = { ur, en }

function readStored(): Lang {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'en' || value === 'ur') return value
  } catch {
    /* storage blocked: fall through to the default */
  }
  return 'ur'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStored)

  // Layout effect, not a plain effect: the saved language (and its direction and font) must be on <html> before the
  // first paint, or an English visitor sees one frame of right-to-left Urdu typography and the page jumps.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = lang === 'ur' ? 'rtl' : 'ltr'
  }, [lang])

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* not persisted; still works for this visit */
    }
  }, [])

  const value = useMemo(
    () => ({
      lang,
      dir: lang === 'ur' ? ('rtl' as const) : ('ltr' as const),
      setLang,
      t: (key: TranslationKey) => dictionaries[lang][key],
    }),
    [lang, setLang],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
