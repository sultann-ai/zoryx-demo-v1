import { useSyncExternalStore } from 'react'
import { parseCartLines, readLastOrder } from './lastOrder'
import type { CartLine } from '../cart/types'

// The last 10 orders placed from this phone, kept in localStorage only (never sent anywhere). Names and totals are
// stored so the list can be drawn without asking the server about every order; `lines` (ids + quantities) feed Reorder.
const KEY = 'mc.orders.v1'
const MAX_ORDERS = 10
const MAX_ITEMS = 30
/** An order this recent can still be in progress (the Orders tab tracks it, the tab shows a dot). */
export const FRESH_MS = 48 * 60 * 60 * 1000

export interface OrderItemSummary {
  n: string
  u: string | null
  q: number
}

export interface HistoryOrder {
  code: string
  publicId: string
  at: number
  total: string
  items: OrderItemSummary[]
  lines?: CartLine[]
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

function parseOrder(raw: unknown): HistoryOrder | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { code, publicId, at, total, items, lines } = raw as Record<string, unknown>
  if (!isText(code, 8) || !/^[A-Z0-9]{3,8}$/.test(code)) return null
  if (!isText(publicId, 40) || !/^[\w-]{10,40}$/.test(publicId)) return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  if (!isText(total, 20) || !Number.isFinite(Number.parseFloat(total))) return null
  if (!Array.isArray(items) || items.length > MAX_ITEMS) return null
  const summary: OrderItemSummary[] = []
  for (const item of items) {
    if (typeof item !== 'object' || item === null) return null
    const { n, u, q } = item as Record<string, unknown>
    if (!isText(n, 120) || (u !== null && !isText(u, 120)) || typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > 99) return null
    summary.push({ n, u: u as string | null, q })
  }
  const parsed = parseCartLines(lines)
  return parsed ? { code, publicId, at, total, items: summary, lines: parsed } : { code, publicId, at, total, items: summary }
}

let cache: HistoryOrder[] | null = null
const listeners = new Set<() => void>()

function read(): HistoryOrder[] {
  if (cache) return cache
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    cache = Array.isArray(value) ? value.map(parseOrder).filter((o): o is HistoryOrder => o !== null).slice(0, MAX_ORDERS) : []
  } catch {
    cache = []
  }
  return cache
}

/** Newest first, at most 10; a repeat of the same order id replaces the old entry. */
export function addOrderToHistory(order: Omit<HistoryOrder, 'at'>): void {
  const entry: HistoryOrder = { ...order, at: Date.now(), items: order.items.slice(0, MAX_ITEMS) }
  cache = [entry, ...read().filter((o) => o.publicId !== entry.publicId)].slice(0, MAX_ORDERS)
  try {
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    /* kept for this visit only */
  }
  listeners.forEach((notify) => notify())
}

export function useOrderHistory(): HistoryOrder[] {
  return useSyncExternalStore(
    (notify) => {
      listeners.add(notify)
      return () => listeners.delete(notify)
    },
    read,
    () => [],
  )
}

/** The id of the newest order if it is recent enough to still be in progress (history first, then the older last-order record). */
export function useFreshOrderId(): string | null {
  const history = useOrderHistory()
  return freshest(history)?.publicId ?? readLastOrder()?.publicId ?? null
}

/** The newest order if it is recent enough to still be in progress. */
export const freshest = (history: HistoryOrder[]): HistoryOrder | null => {
  const newest = history[0]
  return newest && Date.now() - newest.at <= FRESH_MS ? newest : null
}
