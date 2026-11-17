import { createCrudApi } from "./crud";

export interface InventoryLink {
  id: string;
  menuItemId: string;
  menuItem: { id: string; name: string };
  inventoryItemId: string;
  inventoryItem: { id: string; name: string; unit: string };
  quantityPerOrder: string;
}

export interface InventoryLinkCreateInput {
  menuItemId: string;
  inventoryItemId: string;
  quantityPerOrder: number;
}

export interface InventoryLinkUpdateInput {
  menuItemId?: string;
  inventoryItemId?: string;
  quantityPerOrder?: number;
}

export const inventoryLinksApi = createCrudApi<InventoryLink, InventoryLinkCreateInput, InventoryLinkUpdateInput>(
  "/api/pos/inventory/links",
);
