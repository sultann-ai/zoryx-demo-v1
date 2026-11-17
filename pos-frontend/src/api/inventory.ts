import { apiClient } from "./client";

export type InventoryTrackingType = "AUTO" | "MANUAL";
// RESTOCK_CANCEL is written by the server when a cancelled order's stock is returned; never sent.
export type InventoryTxnType = "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT" | "RESTOCK_CANCEL";

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  currentStock: string;
  minThreshold: string | null;
  trackingType: InventoryTrackingType;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryItemCreateInput {
  name: string;
  unit: string;
  currentStock: number;
  trackingType: InventoryTrackingType;
  minThreshold?: number;
}

// currentStock can't be set via update — the backend rejects it (use adjust() instead).
export interface InventoryItemUpdateInput {
  name?: string;
  unit?: string;
  trackingType?: InventoryTrackingType;
  minThreshold?: number | null;
}

export interface InventoryTransaction {
  id: string;
  inventoryItemId: string;
  type: InventoryTxnType;
  quantity: string;
  relatedOrderId: string | null;
  performedById: string;
  note: string | null;
  createdAt: string;
}

export interface AdjustStockInput {
  type: InventoryTxnType;
  quantity: number;
  note?: string;
}

export interface AdjustStockResult {
  inventoryItem: InventoryItem;
  transaction: InventoryTransaction;
}

// Hand-written rather than createCrudApi-based: list() takes a lowStock filter
// instead of no args, there's no remove exposed here, and there's the extra
// adjust-stock endpoint restricted to MANUAL items.
export const inventoryApi = {
  list: async (lowStockOnly: boolean): Promise<InventoryItem[]> => {
    const { data } = await apiClient.get<InventoryItem[]>("/api/pos/inventory", {
      params: lowStockOnly ? { lowStock: "true" } : undefined,
    });
    return data;
  },
  create: async (input: InventoryItemCreateInput): Promise<InventoryItem> => {
    const { data } = await apiClient.post<InventoryItem>("/api/pos/inventory", input);
    return data;
  },
  update: async (id: string, input: InventoryItemUpdateInput): Promise<InventoryItem> => {
    const { data } = await apiClient.put<InventoryItem>(`/api/pos/inventory/${id}`, input);
    return data;
  },
  adjust: async (id: string, input: AdjustStockInput): Promise<AdjustStockResult> => {
    const { data } = await apiClient.post<AdjustStockResult>(`/api/pos/inventory/${id}/adjust`, input);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/pos/inventory/${id}`);
  },
};
