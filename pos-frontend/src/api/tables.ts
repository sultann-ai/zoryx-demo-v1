import { apiClient } from "./client";
import type { DiningAreaType } from "./diningAreas";
import type { OrderItemStatus, OrderSource, OrderStatus, PaymentStatus } from "./orders";

// Table QR, staff side (docs/TABLE_QR_SPEC.md §4.2): the floor map, the layout editor and a table's
// session. Money fields are strings, as everywhere else.

// §3.7 — derived on the server, first matching row wins. The POS never computes it.
export type TableState =
  | "UNAVAILABLE"
  // Table sync: still open from a business day that has ended — settle or close it before reuse.
  | "PREVIOUS_DAY"
  | "EMPTY"
  | "PAYING"
  | "BILL_REQUESTED"
  | "ORDER_AWAITING"
  | "IN_KITCHEN"
  | "SERVED"
  | "SEATED";

// An open waiter call: "OPEN", or "ESCALATED" once one has waited past the escalation time.
export type TableAttention = null | "OPEN" | "ESCALATED";

export type TableShape = "RECT" | "ROUND";

export type TableCallType = "WATER" | "NAPKINS" | "BILL_CASH" | "OTHER";
export type TableCallStatus = "RAISED" | "ACKNOWLEDGED" | "RESOLVED" | "CANCELLED";

// Abstract units on a 1000 × 1000 canvas per area; x/y is the top-left of the unrotated box.
export interface TableLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: TableShape;
  rotation: number;
}

export interface FloorCall {
  id: string;
  type: TableCallType;
  status: TableCallStatus;
  createdAt: string;
  escalated: boolean;
}

export interface FloorSession {
  id: string;
  seatedAt: string;
  waiter: { id: string; name: string } | null;
  guestCount: number;
  awaitingCount: number;
  openCalls: FloorCall[];
  // Phase 2 (table bill); always null until then.
  bill: { status: string; paid: number; of: number } | null;
  // Table sync (docs/TABLE_SYNC_SPEC.md): how the session was opened, what's on it so far, and merges.
  openedVia?: TableSessionOpenedVia;
  openedByOrderId?: string | null;
  orderCount?: number;
  total?: string;
  fromPreviousDay?: boolean;
  // This table is merged into another table's session (the tile reads "with <name>").
  joinedTo?: { tableId: string; name: string } | null;
  // Tables merged into this one's session.
  joined?: { tableId: string; name: string }[];
}

export type TableSessionOpenedVia = "SEAT" | "STAFF_ORDER" | "SCHEDULED_ORDER" | "SPLIT_OFF" | "MIGRATION";

export interface FloorTable {
  id: string;
  name: string;
  // The room/section; null = none ("Other").
  area: string | null;
  type: DiningAreaType;
  capacity: number | null;
  // null = not placed on the map yet.
  layout: TableLayout | null;
  outOfService: boolean;
  // A switched-off table that still has an open session (from before that was refused).
  inactive?: boolean;
  state: TableState;
  attention: TableAttention;
  readyCount: number;
  session: FloorSession | null;
}

export interface FloorPlan {
  // Every active table's area, "" for none (sorted last).
  areas: string[];
  tables: FloorTable[];
}

export interface LayoutEntry {
  id: string;
  // All four null = take the table off the map.
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  shape?: TableShape;
  rotation?: number;
}

interface LineGuest {
  id: string;
  displayName: string;
}

export interface TableSessionOrder {
  id: string;
  orderNumber: number;
  status: OrderStatus;
  // Where it came from: the POS counter, a waiter (ORDER_TAKER) or a guest's phone (TABLE_QR).
  source: OrderSource;
  paymentStatus: PaymentStatus;
  diningAreaId: string | null;
  totalAmount: string;
  createdAt: string;
  scheduledFor: string | null;
  tableGuest: LineGuest | null;
  items: {
    id: string;
    quantity: number;
    status: OrderItemStatus;
    menuItem: { id: string; name: string } | null;
    tableGuest: LineGuest | null;
  }[];
  dealLines: { id: string; quantity: number }[];
}

export interface TableSessionGuest {
  id: string;
  displayName: string;
  joinOrder: number;
  joinedAt: string;
  lastSeenAt: string;
  revoked: boolean;
}

// The table bill (phase 2, spec §3.5/§3.6/§7). REQUESTED locks the table's ordering; PAID once every
// share of the current split is verified; UNLOCKED when staff let the table order again.
export type TableBillStatus = "REQUESTED" | "UNLOCKED" | "PAID";
export type TableShareStatus = "UNPAID" | "PROOF_SUBMITTED" | "VERIFIED" | "REJECTED" | "VOID";
export type SplitMode = "EQUAL" | "BY_ITEMS" | "CUSTOM";

export interface TableBillShare {
  id: string;
  position: number;
  // A guest's name (By items), or "Share 2 of 4" (Equal / Custom).
  label: string;
  guestId: string | null;
  amount: string;
  status: TableShareStatus;
  method: "CASH" | "ONLINE" | null;
  // The guest tapped "Pay cash": a waiter is on the way to collect it.
  cashRequested: boolean;
  rejectedReason: string | null;
  hasProof: boolean;
  // The proof image's id; a new upload replaces it.
  proofMediaId: string | null;
  // Cash handed over, and the change due from it (both null unless recorded).
  paidAmount: string | null;
  change: string | null;
  verifiedAt: string | null;
}

export interface TableBill {
  id: string;
  // Sent back as expectedVersion on every bill write; a stale one answers 409 BILL_CHANGED.
  version: number;
  status: TableBillStatus;
  requestedAt: string;
  subtotal: string;
  discount: string;
  total: string;
  discountReason: string | null;
  splitMode: SplitMode | null;
  splitVersion: number;
  // Why the split/discount/payments are refused right now; null when nothing blocks them.
  blockedReason: "ORDERS_AWAITING" | "SPLIT_HAS_PAYMENTS" | null;
  // The split was cancelled by a change to the bill (items added, discount changed): split again.
  needsSplit: boolean;
  paidAt: string | null;
  // The current split's shares only (void and older ones are history).
  shares: TableBillShare[];
}

export interface TableSessionDetail {
  session: {
    id: string;
    diningAreaId: string;
    status: "OPEN" | "CLOSED" | "VOIDED";
    // null when the PIN setting was off at seat time.
    pin: string | null;
    seatedAt: string;
    closedAt: string | null;
    waiterStaff: { id: string; name: string } | null;
    seatedBy: { id: string; name: string } | null;
    openedVia?: TableSessionOpenedVia;
    openedByOrderId?: string | null;
    mergedIntoSessionId?: string | null;
  };
  table: { id: string; name: string; area: string | null; capacity: number | null };
  guests: TableSessionGuest[];
  orders: TableSessionOrder[];
  // null until someone asks for the bill.
  bill: TableBill | null;
}

// The receipt snapshot (spec §7.6): made once when the bill is paid (or at close for a table paid
// order by order), never recomputed. No staff names, phones, proofs or discount reasons.
export interface TableReceiptSnapshot {
  shop: { nameEn: string | null; nameUr: string | null; addressEn: string | null; phone: string | null };
  table: { name: string; area: string | null };
  seatedAt: string;
  issuedAt: string;
  businessDayLabel: string | null;
  orders: {
    orderNumber: number;
    guestName: string | null;
    lines: { name: string; nameUr: string | null; size: string | null; addOns: string[]; quantity: number; lineTotal: string }[];
  }[];
  subtotal: string;
  discount: string;
  total: string;
  shares: { label: string; amount: string; method: "CASH" | "ONLINE" | null }[];
  isDemo: boolean;
}

export interface TableReceipt {
  // The long public link's key: /r/<receiptKey> on the customer website.
  receiptKey: string;
  receipt: TableReceiptSnapshot;
}

export type SplitInput =
  | { mode: "EQUAL"; parts: number }
  | { mode: "BY_ITEMS" }
  | { mode: "CUSTOM"; shares: { amount: string; guestId?: string }[] };

// A waiter call as staff screens get it (GET /table-calls, oldest first).
export interface StaffTableCall {
  id: string;
  sessionId: string;
  type: TableCallType;
  // Up to 80 characters; set for OTHER.
  note: string | null;
  status: TableCallStatus;
  createdAt: string;
  // Set once by the server when a call sat unacknowledged past the escalation time (2 min).
  escalatedAt: string | null;
  table: { id: string; name: string; area: string | null };
  guestName: string | null;
  // The waiter it was sent to; null = every order taker.
  routedTo: { id: string; name: string } | null;
  acknowledgedBy: { id: string; name: string } | null;
  acknowledgedAt: string | null;
}

export interface SeatResult {
  session: { id: string; seatedAt: string; waiter: { id: string; name: string } | null };
  pin: string | null;
}

export async function fetchFloorPlan(): Promise<FloorPlan> {
  const { data } = await apiClient.get<FloorPlan>("/api/pos/tables/floor");
  return data;
}

export async function saveFloorLayout(tables: LayoutEntry[]): Promise<{ updated: number }> {
  const { data } = await apiClient.put<{ updated: number }>("/api/pos/tables/layout", { tables });
  return data;
}

export async function seatTable(diningAreaId: string): Promise<SeatResult> {
  const { data } = await apiClient.post<SeatResult>(`/api/pos/tables/${diningAreaId}/seat`, {});
  return data;
}

export async function fetchTableSession(id: string): Promise<TableSessionDetail> {
  const { data } = await apiClient.get<TableSessionDetail>(`/api/pos/table-sessions/${id}`);
  return data;
}

export async function rotateTablePin(sessionId: string): Promise<{ pin: string }> {
  const { data } = await apiClient.post<{ pin: string }>(`/api/pos/table-sessions/${sessionId}/pin/rotate`);
  return data;
}

export async function closeTableSession(sessionId: string): Promise<{ receiptKey: string | null }> {
  const { data } = await apiClient.post<{ receiptKey: string | null }>(`/api/pos/table-sessions/${sessionId}/close`);
  return data;
}

// ---- The table bill (staff). Every write answers { bill }, the bill as it now stands. ----

const billPath = (sessionId: string) => `/api/pos/table-sessions/${sessionId}/bill`;
const sharePath = (sessionId: string, shareId: string) => `${billPath(sessionId)}/shares/${shareId}`;

export async function requestTableBill(sessionId: string): Promise<{ bill: TableBill }> {
  const { data } = await apiClient.post<{ bill: TableBill }>(billPath(sessionId), {});
  return data;
}

export async function unlockTableBill(sessionId: string, expectedVersion: number): Promise<{ bill: TableBill }> {
  const { data } = await apiClient.post<{ bill: TableBill }>(`${billPath(sessionId)}/unlock`, { expectedVersion });
  return data;
}

export async function setTableBillDiscount(
  sessionId: string,
  input: { discount: string; discountReason?: string; expectedVersion: number },
): Promise<{ bill: TableBill }> {
  const { data } = await apiClient.put<{ bill: TableBill }>(`${billPath(sessionId)}/discount`, input);
  return data;
}

export async function setTableBillSplit(sessionId: string, input: SplitInput & { expectedVersion: number }): Promise<{ bill: TableBill }> {
  const { data } = await apiClient.put<{ bill: TableBill }>(`${billPath(sessionId)}/split`, input);
  return data;
}

// Cash collected at the table. paidAmount (what was handed over, ≥ the share) is optional.
export async function markTableSharePaid(sessionId: string, shareId: string, paidAmount: string | null): Promise<{ bill: TableBill }> {
  const { data } = await apiClient.post<{ bill: TableBill }>(`${sharePath(sessionId, shareId)}/mark-paid`, paidAmount ? { paidAmount } : {});
  return data;
}

export async function verifyTableShare(sessionId: string, shareId: string): Promise<{ bill: TableBill }> {
  const { data } = await apiClient.post<{ bill: TableBill }>(`${sharePath(sessionId, shareId)}/verify`, {});
  return data;
}

export async function rejectTableShare(sessionId: string, shareId: string, reason: string): Promise<{ bill: TableBill }> {
  const { data } = await apiClient.post<{ bill: TableBill }>(`${sharePath(sessionId, shareId)}/reject`, { reason });
  return data;
}

export async function unmarkTableShare(sessionId: string, shareId: string, reason: string): Promise<{ bill: TableBill }> {
  const { data } = await apiClient.post<{ bill: TableBill }>(`${sharePath(sessionId, shareId)}/unmark`, { reason });
  return data;
}

// The guest's proof image. Staff-only, so fetched as a blob (see useProofImageUrl).
export async function fetchTableShareProof(sessionId: string, shareId: string, size: "thumb" | "full"): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`${sharePath(sessionId, shareId)}/payment-proof`, { params: { size }, responseType: "blob" });
  return data;
}

// 404 NOT_READY until the bill is paid (or the table closed with something paid).
export async function fetchTableReceipt(sessionId: string): Promise<TableReceipt> {
  const { data } = await apiClient.get<TableReceipt>(`/api/pos/table-sessions/${sessionId}/receipt`);
  return data;
}

export async function printTableReceipt(sessionId: string, printerId?: string): Promise<{ printed: number }> {
  const { data } = await apiClient.post<{ printed: number }>(`/api/pos/table-sessions/${sessionId}/receipt/print`, printerId ? { printerId } : {});
  return data;
}

// ---- Table sync (docs/TABLE_SYNC_SPEC.md R4, R7, R13) ----

// What every table conflict (409) carries about the table's open session.
export interface TableSessionSummary {
  id: string;
  tableName: string;
  openedAt: string;
  openedVia: TableSessionOpenedVia;
  orderCount: number;
  total: string;
  guestCount: number;
  fromPreviousDay: boolean;
}

// A table an order just opened: its session, and the join PIN when the PIN setting is on (shown once).
export interface TableOpened {
  sessionId: string;
  pin: string | null;
}

export async function moveOrderToTable(
  orderId: string,
  input: { diningAreaId: string; expectedTableSessionId: string | null },
): Promise<{ orderId: string; diningAreaId: string; tableSessionId: string | null; tableOpened: TableOpened | null }> {
  const { data } = await apiClient.post(`/api/pos/orders/${orderId}/move-table`, input);
  return data;
}

export async function moveTableSession(sessionId: string, diningAreaId: string): Promise<{ sessionId: string; diningAreaId: string; movedOrders: number }> {
  const { data } = await apiClient.post(`/api/pos/table-sessions/${sessionId}/move`, { diningAreaId });
  return data;
}

export async function mergeTableSession(sessionId: string, intoSessionId: string): Promise<{ sessionId: string; mergedSessionId: string }> {
  const { data } = await apiClient.post(`/api/pos/table-sessions/${sessionId}/merge`, { intoSessionId });
  return data;
}

export interface SettleTableInput {
  method: "CASH" | "ONLINE";
  paidAmount?: string;
  discount?: string;
  discountReason?: string;
}

// Pays the whole table at the counter and closes it (one share, "Paid at the counter").
export async function settleTableSession(
  sessionId: string,
  input: SettleTableInput,
): Promise<{ session: { id: string; status: string }; receiptKey: string | null; change: string | null }> {
  const { data } = await apiClient.post(`/api/pos/table-sessions/${sessionId}/settle`, input);
  return data;
}

// SA/PA: closes a table that never had an accepted order (seated by mistake, guests left).
export async function voidTableSession(sessionId: string, reason: string): Promise<{ session: { id: string; status: string } }> {
  const { data } = await apiClient.post(`/api/pos/table-sessions/${sessionId}/void`, { reason });
  return data;
}

// The running bill on the receipt printer ("BILL - NOT A RECEIPT"), built on the server.
export async function printTableBill(sessionId: string, printerId?: string): Promise<{ printed: number }> {
  const { data } = await apiClient.post<{ printed: number }>(`/api/pos/table-sessions/${sessionId}/bill/print`, printerId ? { printerId } : {});
  return data;
}

export async function fetchOpenTableCalls(): Promise<StaffTableCall[]> {
  const { data } = await apiClient.get<StaffTableCall[]>("/api/pos/table-calls", { params: { status: "open" } });
  return data;
}

export async function acknowledgeTableCall(callId: string): Promise<StaffTableCall> {
  const { data } = await apiClient.post<StaffTableCall>(`/api/pos/table-calls/${callId}/acknowledge`);
  return data;
}

export async function resolveTableCall(callId: string): Promise<StaffTableCall> {
  const { data } = await apiClient.post<StaffTableCall>(`/api/pos/table-calls/${callId}/resolve`);
  return data;
}

export async function regenerateTableQrKey(diningAreaId: string): Promise<{ id: string; qrKey: string }> {
  const { data } = await apiClient.post<{ id: string; qrKey: string }>(`/api/pos/dining-areas/${diningAreaId}/qr-key/regenerate`);
  return data;
}

// GET /tables/qr-sheet (SA/PA): every active table with its QR key. The server makes a key for any
// table that has none yet, so a fresh install can print straight away.
export interface QrSheetTable {
  id: string;
  name: string;
  area: string | null;
  qrKey: string;
}

export async function fetchQrSheet(): Promise<{ tables: QrSheetTable[] }> {
  const { data } = await apiClient.get<{ tables: QrSheetTable[] }>("/api/pos/tables/qr-sheet");
  return data;
}
