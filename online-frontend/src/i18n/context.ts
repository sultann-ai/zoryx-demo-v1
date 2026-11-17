import { createContext, useContext } from 'react'
import type { TranslationKey } from './ur'

export type Lang = 'ur' | 'en'

export interface LanguageValue {
  lang: Lang
  dir: 'rtl' | 'ltr'
  setLang: (lang: Lang) => void
  t: (key: TranslationKey) => string
}

export const LanguageContext = createContext<LanguageValue | null>(null)

/** const { t, lang, dir, setLang } = useT() */
export function useT(): LanguageValue {
  const value = useContext(LanguageContext)
  if (!value) throw new Error('useT must be used inside <LanguageProvider>')
  return value
}
