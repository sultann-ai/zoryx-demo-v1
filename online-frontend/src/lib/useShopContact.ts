import { useStore } from '../api/store'
import { SHOP_MAP_URL, SHOP_WHATSAPP } from './config'

/** The store's WhatsApp number from the API once known, else the constant in site.config.json. */
export function useShopWhatsApp(): string {
  return useStore().data?.settings.whatsappNumber?.trim() || SHOP_WHATSAPP
}

/** The store's map link from the API once known, else the constant in site.config.json. */
export function useShopMapUrl(): string {
  return useStore().data?.settings.mapUrl?.trim() || SHOP_MAP_URL
}
