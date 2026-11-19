import { useQuery } from '@tanstack/react-query'
import { useContext } from 'react'
import { MenuSourceContext } from './menuSource'
import type { ImageUrls } from './store'

export interface AddOn {
  id: string
  name: string
  price: string
}

export interface MenuVariant {
  id: string
  label: string
  price: string | null
  sortOrder: number
  addOns: AddOn[]
}

// GET /api/online/menu (docs/BACKEND_API.md). Money is a string; images are relative to the API origin.
export interface MenuItem {
  id: string
  name: string
  nameUr: string | null
  description: string | null
  descriptionUr: string | null
  price: string | null
  slug: string
  categoryId: string | null
  imageUrl: string | null
  image: ImageUrls | null
  isFeatured: boolean
  /** Created in the last 14 days. Absent on older API responses. */
  isNew?: boolean
  sortOrder: number
  /** False for deal-only or half-configured items: never shown, never orderable. */
  orderable: boolean
  /** Not sent by the API today (open-price items are filtered out server-side); handled if it ever is. */
  isOpenPrice?: boolean
  variants: MenuVariant[]
}

export interface MenuCategory {
  id: string
  name: string
  nameUr: string | null
  sortOrder: number
  /** Optional category photo; without one the site uses the first item's photo. */
  image?: ImageUrls | null
}

export interface PublicMenu {
  categories: MenuCategory[]
  items: MenuItem[]
}

/** The menu of the surrounding MenuSource: the online menu, or the table QR menu inside the table pages. */
export function useMenu() {
  return useQuery(useContext(MenuSourceContext).menu)
}

/** The price to show on a card: the item's own, else the cheapest size ("from"). */
export function displayPrice(item: MenuItem): { amount: string; from: boolean } | null {
  if (item.variants.length > 0) {
    const prices = item.variants.map((v) => v.price).filter((p): p is string => p !== null)
    if (prices.length === 0) return null
    const lowest = prices.reduce((a, b) => (Number.parseFloat(b) < Number.parseFloat(a) ? b : a))
    return { amount: lowest, from: true }
  }
  if (item.price !== null) return { amount: item.price, from: false }
  return null
}
