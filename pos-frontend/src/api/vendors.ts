import { apiClient } from "./client";

export type VendorLedgerEntryType = "PURCHASE" | "PAYMENT";

interface VendorBase {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

// GET /vendors/:id, and every write endpoint's response — no balance, since
// that's only ever computed alongside the ledger it's derived from.
export interface Vendor extends VendorBase {}

// GET /vendors — each row's balance computed in the same query, so the list
// screen doesn't need a second request per row.
export interface VendorSummary extends VendorBase {
  balance: string;
}

export interface VendorCreateInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  address?: string;
  isActive?: boolean;
}

export interface VendorUpdateInput {
  name?: string;
  contactPerson?: string | null;
  phone?: string | null;
  address?: string | null;
  isActive?: boolean;
}

export interface VendorLedgerEntry {
  id: string;
  vendorId: string;
  type: VendorLedgerEntryType;
  amount: string;
  description: string | null;
  date: string;
  recordedById: string;
  recordedBy: { id: string; name: string };
  createdAt: string;
}

export interface VendorLedger {
  entries: VendorLedgerEntry[];
  balance: string;
}

export interface AddLedgerEntryInput {
  type: VendorLedgerEntryType;
  amount: number;
  description?: string;
  date: string;
}

const BASE_PATH = "/api/pos/vendors";

export const vendorsApi = {
  list: async (): Promise<VendorSummary[]> => {
    const { data } = await apiClient.get<VendorSummary[]>(BASE_PATH);
    return data;
  },
  get: async (id: string): Promise<Vendor> => {
    const { data } = await apiClient.get<Vendor>(`${BASE_PATH}/${id}`);
    return data;
  },
  create: async (input: VendorCreateInput): Promise<Vendor> => {
    const { data } = await apiClient.post<Vendor>(BASE_PATH, input);
    return data;
  },
  update: async (id: string, input: VendorUpdateInput): Promise<Vendor> => {
    const { data } = await apiClient.put<Vendor>(`${BASE_PATH}/${id}`, input);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`${BASE_PATH}/${id}`);
  },
  getLedger: async (id: string): Promise<VendorLedger> => {
    const { data } = await apiClient.get<VendorLedger>(`${BASE_PATH}/${id}/ledger`);
    return data;
  },
  addLedgerEntry: async (id: string, input: AddLedgerEntryInput): Promise<VendorLedgerEntry> => {
    const { data } = await apiClient.post<VendorLedgerEntry>(`${BASE_PATH}/${id}/ledger`, input);
    return data;
  },
};
