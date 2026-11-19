import { MAX_LINE_NOTE, MAX_QTY, type CartLine } from './types'

// Versioned: bump the suffix if the shape ever changes, and old data is simply ignored.
export const WEBSITE_CART_KEY = 'mc.cart.v1'

/** Where a cart lives: the website's in localStorage; a table's in sessionStorage, for as long as that tab is open. */
export interface CartStorage {
  key: string
  area: 'local' | 'session'
}

export const WEBSITE_CART: CartStorage = { key: WEBSITE_CART_KEY, area: 'local' }

const store = (area: CartStorage['area']): Storage => (area === 'session' ? sessionStorage : localStorage)

function validLine(value: unknown): value is CartLine {
  if (typeof value !== 'object' || value === null) return false
  const line = value as Record<string, unknown>
  return (
    (line.kind === 'item' || line.kind === 'deal') &&
    typeof line.id === 'string' &&
    line.id.length > 0 &&
    (line.variantId === null || typeof line.variantId === 'string') &&
    Array.isArray(line.addOnIds) &&
    line.addOnIds.every((id) => typeof id === 'string') &&
    Number.isInteger(line.qty) &&
    (line.qty as number) >= 1 &&
    (line.qty as number) <= MAX_QTY &&
    (line.notes === undefined || (typeof line.notes === 'string' && line.notes.length > 0 && line.notes.length <= MAX_LINE_NOTE))
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function loadCart({ key, area }: CartStorage): { lines: CartLine[]; rid: string | null } {
  try {
    const parsed: unknown = JSON.parse(store(area).getItem(key) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return { lines: [], rid: null }
    const { v, lines, rid } = parsed as { v?: unknown; lines?: unknown; rid?: unknown }
    if (v !== 1 || !Array.isArray(lines) || !lines.every(validLine)) return { lines: [], rid: null }
    return { lines, rid: typeof rid === 'string' && UUID.test(rid) ? rid : null }
  } catch {
    return { lines: [], rid: null }
  }
}

/** `rid` is the checkout's idempotency key for this exact cart; it lives and dies with the lines. */
export function saveCart({ key, area }: CartStorage, lines: CartLine[], rid: string | null): void {
  try {
    if (lines.length === 0) store(area).removeItem(key)
    else store(area).setItem(key, JSON.stringify({ v: 1, lines, rid }))
  } catch {
    /* storage blocked or full: the cart still works for this visit */
  }
}
