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

// A forced end (table sync R6) also says which open tables closed with the day (they owed nothing) and
// which were left open — those read "From yesterday" on the map until someone settles or closes them.
export interface EndedBusinessDay extends BusinessDay {
  closedTableSessions?: { id: string; tableName: string }[];
  leftOpenTableSessions?: { id: string; tableName: string }[];
}

export async function endBusinessDay(force?: boolean): Promise<EndedBusinessDay> {
  const { data } = await apiClient.post<EndedBusinessDay>(
    "/api/pos/business-day/end",
    force ? { force: true } : {},
  );
  return data;
}
