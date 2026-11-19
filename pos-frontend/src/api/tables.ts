import { apiClient } from "./client";
import type { DiningAreaType } from "./diningAreas";
import type { OrderItemStatus, OrderStatus } from "./orders";

// Table QR, staff side (docs/TABLE_QR_SPEC.md §4.2): the floor map, the layout editor and a table's
// session. Money fields are strings, as everywhere else.

// §3.7 — derived on the server, first matching row wins. The POS never computes it.
export type TableState =
  | "UNAVAILABLE"
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
}

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
  };
  table: { id: string; name: string; area: string | null; capacity: number | null };
  guests: TableSessionGuest[];
  orders: TableSessionOrder[];
}

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

export async function closeTableSession(sessionId: string): Promise<unknown> {
  const { data } = await apiClient.post(`/api/pos/table-sessions/${sessionId}/close`);
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
