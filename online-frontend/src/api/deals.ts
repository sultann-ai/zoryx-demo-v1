import { useQuery } from '@tanstack/react-query'
import { useContext } from 'react'
import { MenuSourceContext } from './menuSource'
import type { ImageUrls } from './store'

// GET /api/online/deals. A deal is a fixed bundle today (no choice slots), so it is added as-is.
export interface Deal {
  id: string
  name: string
  nameUr: string | null
  description: string | null
  descriptionUr: string | null
  price: string
  code: string
  image: ImageUrls | null
  /** The "Popular" star set in the POS. Absent on older API responses. */
  isFeatured?: boolean
  orderable: boolean
  items: { id: string; menuItemId: string; quantity: number; menuItem: { id: string; name: string; nameUr: string | null } }[]
}

/** The deals of the surrounding MenuSource (online, or the table QR menu's). */
export function useDeals() {
  return useQuery(useContext(MenuSourceContext).deals)
}
