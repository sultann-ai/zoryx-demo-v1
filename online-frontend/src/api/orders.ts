import { useQuery } from '@tanstack/react-query'
import { ApiError, apiFetch } from './client'

// POST /api/online/guest-orders — shapes from backend/src/modules/guestOrder.
export type OrderType = 'DELIVERY' | 'PICKUP'

export interface GuestOrderBody {
  clientRequestId: string
  /** Defaults to DELIVERY on the server; PICKUP needs only a name and phone. */
  orderType: OrderType
  items: { menuItemId: string; quantity: number; variantId?: string; addOnIds?: string[] }[]
  deals: { dealId: string; quantity: number }[]
  customer: {
    name: string
    phone: string
    // Delivery only (a pickup order sends just name and phone).
    deliveryAreaId?: string
    // Instead of deliveryAreaId when the customer's area isn't listed.
    otherArea?: string
    house?: string
    street?: string
    landmark?: string
  }
  notes?: string
  paymentMethod: 'CASH' | 'ONLINE'
  /** Honeypot: always sent, always empty for a real person. */
  website: string
}

export interface GuestOrderResult {
  publicId: string
  publicCode: string
  orderNumber: number
  total: string
  deliveryFee: string
  paymentMethod: 'CASH' | 'ONLINE'
  status: 'RECEIVED'
  orderType: OrderType
}

/** Error codes the backend sends on this route (always as { code, error }). */
export type GuestOrderErrorCode =
  | 'ORDERING_CLOSED'
  | 'PICKUP_UNAVAILABLE'
  | 'DELIVERY_UNAVAILABLE'
  | 'BAD_PHONE'
  | 'BAD_AREA'
  | 'BELOW_MINIMUM'
  | 'ITEM_UNAVAILABLE'
  | 'ORDER_TOO_LARGE'
  | 'BAD_REQUEST'
  | 'REQUEST_ID_REUSED'
  | 'TOO_MANY'

export function createGuestOrder(body: GuestOrderBody): Promise<GuestOrderResult> {
  return apiFetch<GuestOrderResult>('/api/online/guest-orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** POST /api/online/orders/:publicId/payment-proof: one image (JPEG/PNG/WebP, up to 5 MB) for an ONLINE order still waiting for payment. */
export function uploadPaymentProof(publicId: string, file: File): Promise<{ paymentState: PaymentState }> {
  const body = new FormData()
  body.append('file', file)
  return apiFetch<{ paymentState: PaymentState }>(`/api/online/orders/${encodeURIComponent(publicId)}/payment-proof`, { method: 'POST', body })
}

// GET /api/online/orders/:publicId — never includes phone, address or notes.
export type CustomerStatus = 'RECEIVED' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'ON_THE_WAY' | 'DELIVERED' | 'CANCELLED'
export type PaymentState =
  | 'NOT_REQUIRED'
  | 'WAITING_FOR_PAYMENT'
  | 'PROOF_RECEIVED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_PROBLEM'

export interface OrderLine {
  kind: 'item' | 'deal'
  name: string
  nameUr: string | null
  size?: string | null
  quantity: number
  lineTotal: string
}

export interface PickupShop {
  addressEn: string
  addressUr: string
  mapUrl: string
  noteEn: string | null
  noteUr: string | null
}

export interface OrderStatus {
  publicCode: string
  /** PICKUP: READY means ready to collect (never ON_THE_WAY) and DELIVERED means collected. */
  orderType: OrderType
  /** Only for PICKUP: where to collect. */
  pickup?: PickupShop
  status: CustomerStatus
  cancelReason: string | null
  payment: { method: 'CASH' | 'ONLINE'; state: PaymentState }
  lines: OrderLine[]
  subtotal: string
  discount: string
  deliveryFee: string
  total: string
  createdAt: string
}

export const isFinalStatus = (status: CustomerStatus): boolean => status === 'DELIVERED' || status === 'CANCELLED'

const POLL_MS = 20_000

/** Polls every 20s while the tab is visible and the order is still open; stops on Delivered / Cancelled. */
export function useOrderStatus(publicId: string) {
  return useQuery({
    queryKey: ['order', publicId],
    queryFn: () => apiFetch<OrderStatus>(`/api/online/orders/${encodeURIComponent(publicId)}`),
    staleTime: 0,
    refetchOnWindowFocus: true,
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 2,
    refetchInterval: (query) => {
      const data = query.state.data
      if (data && isFinalStatus(data.status)) return false
      return document.visibilityState === 'visible' ? POLL_MS : false
    },
  })
}
