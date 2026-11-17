import { useQuery } from '@tanstack/react-query'
import { apiFetch } from './client'

export interface ImageUrls {
  thumb: string
  full: string
  /** A cut-out photo (background removed): show it whole instead of cropping it. Absent on older API responses. */
  hasTransparency?: boolean
}

// GET /api/online/store (see docs/BACKEND_API.md). Text fields come in English + Urdu pairs.
export interface PublicStoreSettings {
  shopNameEn: string | null
  shopNameUr: string | null
  taglineEn: string | null
  taglineUr: string | null
  phone: string | null
  whatsappNumber: string | null
  addressEn: string | null
  addressUr: string | null
  mapUrl: string | null
  openingHoursEn: string | null
  openingHoursUr: string | null
  announcementEn: string | null
  announcementUr: string | null
  facebookUrl: string | null
  instagramUrl: string | null
  tiktokUrl: string | null
  // Ways to order. Pickup is a TAKEAWAY order: no address, no delivery fee, its own minimum.
  deliveryEnabled: boolean
  pickupEnabled: boolean
  pickupMinOrderAmount: string
  pickupNoteEn: string | null
  pickupNoteUr: string | null
}

export interface DeliveryArea {
  id: string
  nameEn: string
  nameUr: string | null
  deliveryFee: string
  minOrderAmount: string | null
}

export interface PaymentAccount {
  id: string
  label: string
  accountTitle: string
  accountNumber: string
  qrUrl: string | null
}

export interface GalleryEntry {
  id: string
  captionEn: string | null
  captionUr: string | null
  image: ImageUrls
}

export interface Testimonial {
  id: string
  name: string
  area: string | null
  text: string
  textUr: string | null
  rating: number | null
}

export interface PublicStore {
  settings: PublicStoreSettings
  deliveryAreas: DeliveryArea[]
  paymentAccounts: PaymentAccount[]
  gallery: GalleryEntry[]
  testimonials: Testimonial[]
  orderingOpen: boolean
  closedReason: 'switched_off' | 'no_business_day' | null
}

export function useStore() {
  return useQuery({
    queryKey: ['store'],
    queryFn: () => apiFetch<PublicStore>('/api/online/store'),
  })
}
