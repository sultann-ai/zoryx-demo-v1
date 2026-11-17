import { apiClient } from "./client";

export interface BusinessDay {
  id: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  isActive: boolean;
  openedById: string;
  closedById: string | null;
}

export async function fetchCurrentBusinessDay(): Promise<BusinessDay | null> {
  const { data } = await apiClient.get<BusinessDay | null>("/api/pos/business-day/current");
  return data;
}

export async function startBusinessDay(label?: string): Promise<BusinessDay> {
  const { data } = await apiClient.post<BusinessDay>(
    "/api/pos/business-day/start",
    label ? { label } : {},
  );
  return data;
}

export async function endBusinessDay(force?: boolean): Promise<BusinessDay> {
  const { data } = await apiClient.post<BusinessDay>(
    "/api/pos/business-day/end",
    force ? { force: true } : {},
  );
  return data;
}
