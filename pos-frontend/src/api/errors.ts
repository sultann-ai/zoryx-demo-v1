import axios from "axios";
import type { OrderSource, OrderStatus, OrderType, PaymentMethod, PaymentStatus } from "./orders";
import type { TableSessionSummary } from "./tables";

// Matches the backend's universal error shape ({ error: string }), plus the
// occasional extra field an endpoint attaches (e.g. business-day/end's orderIds).
export interface ApiErrorBody {
  error?: string;
  orderIds?: string[];
  // business-day/end's 409 when scheduled orders are still on hold.
  code?: string;
  scheduledOrders?: { id: string; orderNumber: number; scheduledFor: string }[];
  // business-day/end's 400: accepted orders nobody marked paid (not in the day's sales).
  unpaidOrders?: { id: string; orderNumber: number; totalAmount: string; status: string }[];
  unpaidTotal?: string;
  // business-day/end's 400: the open orders blocking it, for the End Day dialog's Complete/Cancel.
  openOrders?: {
    id: string;
    orderNumber: number;
    status: OrderStatus;
    type: OrderType;
    source: OrderSource;
    paymentMethod: PaymentMethod;
    paymentStatus: PaymentStatus;
    totalAmount: string;
    diningArea: { name: string } | null;
  }[];
  // Table sync: the open session a table conflict is about (TABLE_OCCUPIED, TABLE_STATE_CHANGED,
  // TABLE_FROM_PREVIOUS_DAY, TABLE_DECISION_NEEDED), or the session id alone (TARGET_OCCUPIED, USE_TABLE_BILL).
  session?: TableSessionSummary | null;
  sessionId?: string | null;
  // business-day/end's 400: tables still open on the day, what each owes, and whether a forced end closes it.
  openTableSessions?: OpenTableSession[];
}

export interface OpenTableSession {
  id: string;
  table: { name: string; area: string | null };
  seatedAt: string;
  orderCount: number;
  owed?: string;
  canClose?: boolean;
}

export function getApiErrorBody(error: unknown): ApiErrorBody | undefined {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    return error.response?.data;
  }
  return undefined;
}

export function getApiErrorStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const body = getApiErrorBody(error);
  return typeof body?.error === "string" ? body.error : fallback;
}
