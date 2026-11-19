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
  /** A note for the kitchen on this line (table QR only; the website has no line notes). */
  notes?: string
}

export const MAX_QTY = 50

/** The server's limit on a line's kitchen note (ORDER_LINE_NOTE_MAX_LENGTH). */
export const MAX_LINE_NOTE = 100

/** The same item with a different note is a different line ("no onion" next to the plain one). */
export const lineKey = (line: Pick<CartLine, 'kind' | 'id' | 'variantId' | 'addOnIds' | 'notes'>): string =>
  `${line.kind}:${line.id}:${line.variantId ?? ''}:${[...line.addOnIds].sort().join(',')}${line.notes ? `:${line.notes}` : ''}`
