/**
 * A cart line stores only ids and a quantity. Names, photos and prices are looked up from the live menu when
 * rendering, so a stale or tampered localStorage can never set a price (the server prices every order anyway).
 */
export interface CartLine {
  kind: 'item' | 'deal'
  /** menuItemId or dealId */
  id: string
  variantId: string | null
  addOnIds: string[]
  qty: number
}

export const MAX_QTY = 50

export const lineKey = (line: Pick<CartLine, 'kind' | 'id' | 'variantId' | 'addOnIds'>): string =>
  `${line.kind}:${line.id}:${line.variantId ?? ''}:${[...line.addOnIds].sort().join(',')}`
