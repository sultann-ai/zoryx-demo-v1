import { useStore } from '../api/store'
import { useT } from '../i18n'
import { pick } from '../lib/localized'
import { brand } from './brand.config'

/** The shop name in the page language: store settings first, brand.config.ts as the fallback while loading or offline. */
export function useShopName(): string {
  const { lang } = useT()
  const settings = useStore().data?.settings
  return pick(lang, settings?.shopNameEn, settings?.shopNameUr) ?? (lang === 'ur' ? brand.nameUr : brand.nameEn)
}
