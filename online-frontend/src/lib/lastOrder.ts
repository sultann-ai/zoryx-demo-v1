import { MAX_QTY, type CartLine } from '../cart/types'

// Written by the checkout after an order is placed; read by the menu banner.
// Shape: { code: "K7P2M", publicId: "<22 chars>", at: <epoch ms>, lines?: CartLine[] }
// `lines` are the ids and quantities of what was ordered (never names or prices), so "Order again" can refill the cart.
const KEY = 'mc.lastOrder'
const MAX_AGE_MS = 48 * 60 * 60 * 1000
const MAX_LINES = 40

export interface LastOrder {
  code: string
  publicId: string
  at: number
  /** Absent for an order saved before this field existed (no "Order again" for it). */
  lines?: CartLine[]
}

const isId = (v: unknown): v is string => typeof v === 'string' && /^[\w-]{1,64}$/.test(v)

export function parseCartLines(value: unknown): CartLine[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINES) return undefined
  const lines: CartLine[] = []
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return undefined
    const { kind, id, variantId, addOnIds, qty } = raw as Record<string, unknown>
    if ((kind !== 'item' && kind !== 'deal') || !isId(id)) return undefined
    if (variantId !== null && !isId(variantId)) return undefined
    if (!Array.isArray(addOnIds) || addOnIds.length > 20 || !addOnIds.every(isId)) return undefined
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return undefined
    lines.push({ kind, id, variantId: variantId as string | null, addOnIds: addOnIds as string[], qty })
  }
  return lines
}

/** Remember the order just placed (the time is stamped here). */
export function saveLastOrder(order: Pick<LastOrder, 'code' | 'publicId' | 'lines'>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...order, at: Date.now() }))
  } catch {
    /* not persisted */
  }
}

export function readLastOrder(): LastOrder | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const { code, publicId, at } = value as Record<string, unknown>
    if (typeof code !== 'string' || typeof publicId !== 'string' || typeof at !== 'number') return null
    if (!/^[A-Z0-9]{3,8}$/.test(code) || !/^[\w-]{10,40}$/.test(publicId)) return null
    if (Date.now() - at > MAX_AGE_MS) return null
    const lines = parseCartLines((value as Record<string, unknown>).lines)
    return lines ? { code, publicId, at, lines } : { code, publicId, at }
  } catch {
    return null
  }
}
