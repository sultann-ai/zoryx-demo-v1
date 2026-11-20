import { useQuery } from '@tanstack/react-query'
import { queryClient } from '../lib/queryClient'
import { ApiError, apiFetch, apiResponse, uploadForm, type UploadOptions } from './client'
import type { Deal } from './deals'
import type { PublicMenu } from './menu'
import type { MenuSource } from './menuSource'
import type { PaymentAccount } from './store'

// The table QR guest API: /api/online/table (docs/TABLE_QR_SPEC.md §4.1, backend/src/modules/tableGuest). Errors are
// always { code, error }. The guest's token goes in X-Table-Token, never in Authorization or a URL.

export type TableClosedReason = 'qr_disabled' | 'no_business_day' | 'not_seated' | 'unavailable'

export interface TableInfo {
  name: string
  area: string | null
}

/** GET /:qrKey: what an unjoined phone sees. Never a session id, PIN or names. */
export interface TableLookup {
  table: TableInfo
  state: 'OPEN' | 'CLOSED' | 'UNAVAILABLE'
  requiresPin: boolean
  orderingOpen: boolean
  closedReason: TableClosedReason | null
}

export interface JoinResult {
  token: string
  guest: { id: string; displayName: string; joinOrder: number }
  session: { table: TableInfo }
}

export type RoundStatus = 'RECEIVED' | 'SENT_TO_KITCHEN' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED'

export interface RoundLine {
  kind: 'item' | 'deal'
  lineId: string
  name: string
  nameUr: string | null
  size: string | null
  addOns: { name: string; price: string }[]
  quantity: number
  lineTotal: string
  note: string | null
  /** The guest whose round added it; null for a line staff added ("the table"). */
  ownerGuestId: string | null
}

export interface Round {
  orderId: string
  orderNumber: number
  guestName: string | null
  isMine: boolean
  status: RoundStatus
  /** Only a reason staff gave (a rejection); a guest's own cancel has none. */
  cancelReason: string | null
  createdAt: string
  total: string
  lines: RoundLine[]
}

export type CallType = 'WATER' | 'NAPKINS' | 'BILL_CASH' | 'OTHER'
export type CallStatus = 'RAISED' | 'ACKNOWLEDGED' | 'RESOLVED' | 'CANCELLED'

export interface MyCall {
  id: string
  type: CallType
  note: string | null
  status: CallStatus
  createdAt: string
}

/** GET /session: the poll. Rounds oldest first; my calls newest first. */
export interface TableSessionPoll {
  version: number
  table: TableInfo
  session: { status: 'OPEN' | 'CLOSED' | 'VOIDED'; seatedAt: string; orderingOpen: boolean; closedReason: TableClosedReason | null }
  me: { guestId: string; displayName: string; joinOrder: number }
  guests: { id: string; displayName: string; isMe: boolean }[]
  rounds: Round[]
  myCalls: MyCall[]
  cooldowns: { orderSeconds: number; callSeconds: number }
  /** The table's bill as this guest sees it; null until someone asks for it. */
  bill: TableBill | null
  /** The receipt link, once the bill is paid. */
  receiptKey: string | null
  /** Client-side: when this answer arrived (Date.now()). A 304 keeps it, so a cooldown counts from the real answer. */
  receivedAt: number
}

// ---------- The bill (phase 2) ----------

export type SplitMode = 'EQUAL' | 'BY_ITEMS' | 'CUSTOM'
export type ShareStatus = 'UNPAID' | 'PROOF_SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'VOID'
export type LineKind = 'ITEM' | 'DEAL'

export interface BillShare {
  id: string
  position: number
  label: string
  /** The owner (by items) or whoever took it ("This is mine"); null while nobody has. */
  guestId: string | null
  isMine: boolean
  amount: string
  status: ShareStatus
  method: 'CASH' | 'ONLINE' | null
  /** The guest chose cash: a waiter is on the way to collect it. */
  cashRequested: boolean
  /** Why staff turned the payment proof down (the guest may send another). */
  rejectedReason: string | null
}

/** A line of the bill this guest may tick ("I had some"): one staff added for the table, or someone else's. */
export interface SharedLine {
  lineKind: LineKind
  lineId: string
  name: string
  nameUr: string | null
  size: string | null
  quantity: number
  lineTotal: string
  /** Who ordered it; null for a line staff added (the table's). */
  ownerName: string | null
  /** Names of the guests who ticked it. */
  claimedBy: string[]
}

export interface TableBill {
  version: number
  status: 'REQUESTED' | 'UNLOCKED' | 'PAID'
  subtotal: string
  discount: string
  total: string
  splitMode: SplitMode | null
  splitVersion: number
  canSplit: boolean
  blockedReason: 'ORDERS_AWAITING' | 'SPLIT_HAS_PAYMENTS' | null
  /** The bill changed after it was split: the split was cancelled, split again. */
  needsSplit: boolean
  shares: BillShare[]
  myClaims: { lineKind: LineKind; lineId: string }[]
  sharedLines: SharedLine[]
}

export interface ReceiptLine {
  name: string
  nameUr: string | null
  size: string | null
  addOns: string[]
  quantity: number
  lineTotal: string
}

/** GET /api/online/receipts/:receiptKey — made once when the bill is paid, never recomputed. */
export interface ReceiptSnapshot {
  shop: { nameEn: string; nameUr: string; addressEn: string; phone: string }
  table: TableInfo
  seatedAt: string
  issuedAt: string
  businessDayLabel: string
  orders: { orderNumber: number; guestName: string | null; lines: ReceiptLine[] }[]
  subtotal: string
  discount: string
  total: string
  shares: { label: string; amount: string; method: 'CASH' | 'ONLINE' | null }[]
  taxInvoiceNumber: string | null
  taxAuthority: string | null
  isDemo: boolean
}

export interface TableOrderBody {
  clientRequestId: string
  items: { menuItemId: string; quantity: number; variantId?: string; addOnIds?: string[]; notes?: string }[]
  deals: { dealId: string; quantity: number }[]
}

export interface TableOrderResult {
  orderId: string
  orderNumber: number
  status: 'RECEIVED'
  total: string
}

/** The codes the guest routes answer with (always { code, error }). */
export type TableErrorCode =
  | 'NOT_FOUND'
  | 'SESSION_ENDED'
  | 'TABLE_CLOSED'
  | 'TABLE_UNAVAILABLE'
  | 'QR_DISABLED'
  | 'ORDERING_CLOSED'
  | 'BAD_PIN'
  | 'PIN_LOCKED'
  | 'SESSION_FULL'
  | 'REQUEST_ID_REUSED'
  | 'TOO_MANY'
  | 'COOLDOWN'
  | 'ITEM_UNAVAILABLE'
  | 'ORDER_TOO_LARGE'
  | 'NOT_CANCELLABLE'
  | 'NOT_OPEN'
  | 'BAD_REQUEST'
  | 'BILL_LOCKED'
  | 'BILL_CHANGED'
  | 'BILL_NOT_REQUESTED'
  | 'BILL_PAID'
  | 'NOTHING_TO_BILL'
  | 'ORDERS_AWAITING'
  | 'SPLIT_HAS_PAYMENTS'
  | 'SPLIT_SUM_MISMATCH'
  | 'NOT_BY_ITEMS'
  | 'NOBODY_TO_SHARE'
  | 'SHARE_TAKEN'
  | 'NOT_YOUR_SHARE'
  | 'NOT_AWAITING_PAYMENT'
  | 'SESSION_NOT_OPEN'

const BASE = '/api/online/table'
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const guest = (token: string, init: RequestInit = {}): RequestInit => ({ ...init, headers: { ...(init.headers ?? {}), 'X-Table-Token': token } })

/** The guest's token no longer works: the table was closed, the guest removed, or the token is unknown. */
export const isSessionEnded = (error: unknown): boolean => error instanceof ApiError && error.status === 401

// ---------- Before joining ----------

export function useTableLookup(qrKey: string, { poll }: { poll: boolean }) {
  return useQuery({
    queryKey: ['table', qrKey],
    queryFn: () => apiFetch<TableLookup>(`${BASE}/${encodeURIComponent(qrKey)}`),
    staleTime: 0,
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 2,
    // While the table isn't open yet, look again now and then: it opens on its own the moment staff seat it.
    refetchInterval: poll ? () => (document.visibilityState === 'visible' ? 10_000 : false) : false,
    refetchOnWindowFocus: true,
  })
}

export function joinTable(qrKey: string, body: { displayName: string; pin?: string; joinRequestId: string }): Promise<JoinResult> {
  return apiFetch<JoinResult>(`${BASE}/${encodeURIComponent(qrKey)}/join`, json(body))
}

// ---------- The QR menu ----------

interface QrMenu extends PublicMenu {
  deals: Deal[]
}

// One request feeds both the menu and the deals (fetchQuery shares the one in flight and caches it for a minute).
const qrMenu = () => queryClient.fetchQuery({ queryKey: ['table-menu'], queryFn: () => apiFetch<QrMenu>(`${BASE}/menu`), staleTime: 60_000 })

/** The QR menu as a MenuSource: the website's cards, item sheet, cart and prices read it unchanged. */
export const QR_MENU_SOURCE: MenuSource = {
  menu: {
    queryKey: ['table-menu', 'items'],
    queryFn: async () => {
      const { categories, items } = await qrMenu()
      return { categories, items }
    },
  },
  deals: { queryKey: ['table-menu', 'deals'], queryFn: async () => (await qrMenu()).deals },
}

// ---------- The guest's session (needs the token) ----------

// The last answer per token, for the 304s: the server only says "nothing changed" (spec §6.3).
const lastPoll = new Map<string, { etag: string; data: TableSessionPoll }>()

async function fetchSession(token: string): Promise<TableSessionPoll> {
  const cached = lastPoll.get(token)
  const response = await apiResponse(`${BASE}/session`, guest(token, cached ? { headers: { 'If-None-Match': cached.etag } } : {}), [304])
  if (response.status === 304 && cached) return cached.data
  const data = { ...((await response.json()) as Omit<TableSessionPoll, 'receivedAt'>), receivedAt: Date.now() }
  const etag = response.headers.get('ETag')
  if (etag) lastPoll.set(token, { etag, data })
  return data
}

export const sessionQueryKey = (token: string) => ['table-session', token] as const

/** Every 5 s while the page is visible, every 30 s while hidden; at once on focus and reconnect. Stops when the session ends. */
export function useTableSession(token: string) {
  return useQuery({
    queryKey: sessionQueryKey(token),
    queryFn: () => fetchSession(token),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchIntervalInBackground: true,
    retry: (failures, error) => !isSessionEnded(error) && failures < 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
    refetchInterval: (query) => {
      if (isSessionEnded(query.state.error)) return false
      return document.visibilityState === 'visible' ? 5_000 : 30_000
    },
  })
}

export function forgetSession(token: string): void {
  lastPoll.delete(token)
  queryClient.removeQueries({ queryKey: sessionQueryKey(token) })
}

export const refreshSession = (token: string) => queryClient.invalidateQueries({ queryKey: sessionQueryKey(token) })

export function sendTableOrder(token: string, body: TableOrderBody): Promise<TableOrderResult> {
  return apiFetch<TableOrderResult>(`${BASE}/orders`, guest(token, json(body)))
}

export function cancelRound(token: string, orderId: string): Promise<{ status: 'CANCELLED' }> {
  return apiFetch(`${BASE}/orders/${encodeURIComponent(orderId)}/cancel`, guest(token, json({})))
}

export function raiseCall(token: string, body: { clientRequestId: string; type: CallType; note?: string }): Promise<MyCall> {
  return apiFetch<MyCall>(`${BASE}/calls`, guest(token, json(body)))
}

export function cancelCall(token: string, callId: string): Promise<{ status: 'CANCELLED' }> {
  return apiFetch(`${BASE}/calls/${encodeURIComponent(callId)}/cancel`, guest(token, json({})))
}

// ---------- The bill (phase 2): every amount is computed on the server ----------

type BillAnswer = { bill: TableBill | null }

/** The answer's bill straight into the poll's cache (the next poll confirms it), so the screen moves at once. */
function showBill(token: string, bill: TableBill | null): void {
  queryClient.setQueryData<TableSessionPoll>(sessionQueryKey(token), (poll) => (poll ? { ...poll, bill } : poll))
  void refreshSession(token)
}

async function billCall<T extends BillAnswer>(token: string, path: string, init: RequestInit): Promise<T> {
  const answer = await apiFetch<T>(`${BASE}${path}`, guest(token, init))
  showBill(token, answer.bill)
  return answer
}

const put = (body: unknown): RequestInit => ({ ...json(body), method: 'PUT' })

/** "Get the bill": locks ordering for the whole table until staff reopen it. Repeating it changes nothing. */
export const requestBill = (token: string) => billCall<BillAnswer>(token, '/bill/request', json({}))

export function setSplit(
  token: string,
  body: { mode: SplitMode; parts?: number; shares?: { amount: string }[]; expectedVersion: number },
) {
  return billCall<BillAnswer>(token, '/bill/split', put(body))
}

/** By items: "I had some of this" (or not), for the calling guest only. */
export function setClaim(token: string, body: { lineKind: LineKind; lineId: string; claimed: boolean; expectedVersion: number }) {
  return billCall<BillAnswer>(token, '/bill/claims', put(body))
}

/** Equal / custom: take an unclaimed share ("This is mine"). */
export const claimShare = (token: string, shareId: string, expectedVersion: number) =>
  billCall<BillAnswer>(token, `/bill/shares/${encodeURIComponent(shareId)}/claim`, json({ expectedVersion }))

/** Cash calls the waiter (once per share); online answers the shop's payment accounts. */
export const payShare = (token: string, shareId: string, method: 'CASH' | 'ONLINE') =>
  billCall<BillAnswer & { paymentAccounts: PaymentAccount[] | null }>(token, `/bill/shares/${encodeURIComponent(shareId)}/pay`, json({ method }))

/** One screenshot (JPEG/PNG/WebP, up to 5 MB) for the guest's own share; a new one replaces the last. */
export async function uploadShareProof(token: string, shareId: string, file: File, options?: UploadOptions): Promise<void> {
  const body = new FormData()
  body.append('file', file)
  await uploadForm(`${BASE}/bill/shares/${encodeURIComponent(shareId)}/payment-proof`, body, options, { 'X-Table-Token': token })
  void refreshSession(token)
}

/** The public receipt behind its long link (GET /api/online/receipts/:receiptKey). It never changes once made. */
export function useReceipt(receiptKey: string | null) {
  return useQuery({
    queryKey: ['receipt', receiptKey],
    queryFn: () => apiFetch<ReceiptSnapshot>(`/api/online/receipts/${encodeURIComponent(receiptKey ?? '')}`),
    enabled: receiptKey !== null,
    staleTime: Infinity,
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 2,
  })
}
