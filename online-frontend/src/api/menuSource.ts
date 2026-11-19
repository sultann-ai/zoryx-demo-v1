import { createContext } from 'react'
import { apiFetch } from './client'
import type { Deal } from './deals'
import type { PublicMenu } from './menu'

/**
 * Where useMenu() / useDeals() read from. The website uses the public online menu; the table QR pages put the QR menu
 * (GET /api/online/table/menu) in a provider, so the same cards, item sheet, cart and prices work unchanged on it.
 */
export interface MenuSource {
  menu: { queryKey: readonly unknown[]; queryFn: () => Promise<PublicMenu> }
  deals: { queryKey: readonly unknown[]; queryFn: () => Promise<Deal[]> }
}

export const ONLINE_MENU_SOURCE: MenuSource = {
  menu: { queryKey: ['menu'], queryFn: () => apiFetch<PublicMenu>('/api/online/menu') },
  deals: { queryKey: ['deals'], queryFn: () => apiFetch<Deal[]>('/api/online/deals') },
}

export const MenuSourceContext = createContext<MenuSource>(ONLINE_MENU_SOURCE)
