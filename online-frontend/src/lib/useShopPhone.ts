import { useStore } from '../api/store'
import { SHOP_PHONE } from './config'

/** The store's phone from the API once known, else the constant in site.config.json. */
export function useShopPhone(): string {
  return useStore().data?.settings.phone?.trim() || SHOP_PHONE
}
