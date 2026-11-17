import { MAX_QTY, type CartLine } from './types'

// Versioned: bump the suffix if the shape ever changes, and old data is simply ignored.
const KEY = 'mc.cart.v1'

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
    (line.qty as number) <= MAX_QTY
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function loadCart(): { lines: CartLine[]; rid: string | null } {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return { lines: [], rid: null }
    const { v, lines, rid } = parsed as { v?: unknown; lines?: unknown; rid?: unknown }
    if (v !== 1 || !Array.isArray(lines) || !lines.every(validLine)) return { lines: [], rid: null }
    return { lines, rid: typeof rid === 'string' && UUID.test(rid) ? rid : null }
  } catch {
    return { lines: [], rid: null }
  }
}

/** `rid` is the checkout's idempotency key for this exact cart; it lives and dies with the lines. */
export function saveCart(lines: CartLine[], rid: string | null): void {
  try {
    if (lines.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify({ v: 1, lines, rid }))
  } catch {
    /* storage blocked or full: the cart still works for this visit */
  }
}
