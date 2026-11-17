import type { Lang } from '../i18n'

/** Pick the Urdu text when the page is Urdu and one exists, else the English one (and vice versa). */
export function pick(lang: Lang, en: string | null | undefined, ur: string | null | undefined): string | null {
  const primary = lang === 'ur' ? ur : en
  const fallback = lang === 'ur' ? en : ur
  return primary?.trim() || fallback?.trim() || null
}
