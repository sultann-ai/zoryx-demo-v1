import { useEffect, useMemo } from 'react'
import { useDeals, type Deal } from '../api/deals'
import { useMenu, type AddOn, type MenuItem } from '../api/menu'
import type { ImageUrls } from '../api/store'
import { useCart } from './context'
import { lineKey, type CartLine } from './types'

export interface ResolvedLine {
  line: CartLine
  key: string
  name: string
  nameUr: string | null
  variantLabel: string | null
  addOns: AddOn[]
  image: ImageUrls | null
  /** Price of one unit including add-ons. */
  unit: number
  total: number
}

const num = (value: string | null): number => (value === null ? Number.NaN : Number.parseFloat(value))

/** Look a stored line up in the live menu/deals. Null means it can no longer be ordered. */
export function resolveLine(
  line: CartLine,
  items: Map<string, MenuItem>,
  deals: Map<string, Deal>,
): ResolvedLine | null {
  const key = lineKey(line)
  if (line.kind === 'deal') {
    const deal = deals.get(line.id)
    if (!deal || !deal.orderable) return null
    const unit = num(deal.price)
    if (!Number.isFinite(unit)) return null
    return { line, key, name: deal.name, nameUr: deal.nameUr, variantLabel: null, addOns: [], image: deal.image, unit, total: unit * line.qty }
  }
  const item = items.get(line.id)
  if (!item || !item.orderable) return null
  let base: number
  let variantLabel: string | null = null
  let addOns: AddOn[] = []
  if (item.variants.length > 0) {
    const variant = item.variants.find((v) => v.id === line.variantId)
    if (!variant) return null
    base = num(variant.price)
    variantLabel = variant.label
    addOns = line.addOnIds.map((id) => variant.addOns.find((a) => a.id === id)).filter((a): a is AddOn => !!a)
    if (addOns.length !== line.addOnIds.length) return null
  } else {
    if (line.variantId !== null || line.addOnIds.length > 0) return null
    base = num(item.price)
  }
  if (!Number.isFinite(base)) return null
  const unit = base + addOns.reduce((sum, a) => sum + num(a.price), 0)
  return { line, key, name: item.name, nameUr: item.nameUr, variantLabel, addOns, image: item.image, unit, total: unit * line.qty }
}

/** The cart joined with the live menu. `ready` is false until both menu and deals have loaded. */
export function useResolvedCart() {
  const cart = useCart()
  const menu = useMenu()
  const deals = useDeals()
  const ready = menu.isSuccess && deals.isSuccess

  const resolved = useMemo(() => {
    if (!menu.data || !deals.data) return { lines: [] as ResolvedLine[], invalid: new Set<string>() }
    const items = new Map(menu.data.items.map((i) => [i.id, i]))
    const dealMap = new Map(deals.data.map((d) => [d.id, d]))
    const lines: ResolvedLine[] = []
    const invalid = new Set<string>()
    for (const line of cart.lines) {
      const r = resolveLine(line, items, dealMap)
      if (r) lines.push(r)
      else invalid.add(lineKey(line))
    }
    return { lines, invalid }
  }, [menu.data, deals.data, cart.lines])

  const total = resolved.lines.reduce((sum, l) => sum + l.total, 0)
  return { ready, lines: resolved.lines, invalid: resolved.invalid, total }
}

/** Remove lines that no longer exist on the menu (call once, from the menu page). */
export function usePruneCart() {
  const { prune, lines } = useCart()
  const { ready, invalid } = useResolvedCart()
  useEffect(() => {
    if (ready && invalid.size > 0) prune(new Set(lines.map(lineKey).filter((k) => !invalid.has(k))))
  }, [ready, invalid, lines, prune])
}
