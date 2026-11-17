// The customer's details, remembered on this phone only (never sent anywhere except with an order).
const KEY = 'mc.details.v1'

export interface SavedDetails {
  name: string
  phone: string
  areaId: string
  house: string
  street: string
  landmark: string
}

// The way the customer last chose to order, remembered with their details.
export type SavedOrderType = 'DELIVERY' | 'PICKUP'
export type StoredDetails = Partial<SavedDetails> & { orderType?: SavedOrderType }

const FIELDS: (keyof SavedDetails)[] = ['name', 'phone', 'areaId', 'house', 'street', 'landmark']

export function loadDetails(): StoredDetails {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return {}
    const out: StoredDetails = {}
    for (const field of FIELDS) {
      const entry = (value as Record<string, unknown>)[field]
      if (typeof entry === 'string' && entry.length <= 200) out[field] = entry
    }
    const orderType = (value as Record<string, unknown>).orderType
    if (orderType === 'DELIVERY' || orderType === 'PICKUP') out.orderType = orderType
    return out
  } catch {
    return {}
  }
}

/** Merges into what is stored: a pickup order keeps the address saved from an earlier delivery order. */
export function saveDetails(details: StoredDetails): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadDetails(), ...details }))
  } catch {
    /* not persisted */
  }
}

export function clearDetails(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to clear */
  }
}
