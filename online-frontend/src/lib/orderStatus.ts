import type { CustomerStatus, OrderType } from '../api/orders'
import type { TranslationKey } from '../i18n'

/** The word for a status, with the pickup wording for Ready and Delivered (Ready for pickup / Collected). */
export function statusLabel(status: CustomerStatus, type: OrderType): TranslationKey {
  if (type === 'PICKUP' && (status === 'READY' || status === 'DELIVERED')) return `st.${status}_PICKUP` as TranslationKey
  return `st.${status}` as TranslationKey
}
