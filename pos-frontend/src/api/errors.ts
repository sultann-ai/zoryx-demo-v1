import axios from "axios";

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
