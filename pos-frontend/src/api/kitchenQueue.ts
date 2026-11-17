import { apiClient } from "./client";
import type { OrderItemDealLineInfo, OrderItemStatus, OrderType } from "./orders";

export interface KitchenQueueDiningArea {
  id: string;
  name: string;
  type: string;
  capacity: number | null;
  isActive: boolean;
}

// Shape of GET /kitchen-queue rows.
export interface KitchenQueueItem {
  id: string;
  orderId: string;
  menuItemId: string;
  menuItem: { id: string; name: string };
  variantId: string | null;
  variantLabel: string | null;
  addOns: { addOnId: string; name: string; price: string }[] | null;
  kitchenId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  status: OrderItemStatus;
  notes: string | null;
  // Set only on items exploded out of a deal's composition — lets the display show
  // "Part of {dealName}", "- customized" when it isn't the deal's standard contents, and the
  // deal line's note (which applies to every item exploded from it).
  dealOrderLine: OrderItemDealLineInfo | null;
  createdAt: string;
  updatedAt: string;
  order: {
    orderNumber: number;
    diningArea: KitchenQueueDiningArea | null;
  };
}

// Socket.io "order-item:new" payload — one order's items, batched, with the
// order-level fields (orderNumber/diningArea) lifted out rather than repeated
// per item the way the GET response has them.
export interface NewOrderItemsSocketPayload {
  orderId: string;
  orderNumber: number;
  type: OrderType;
  diningArea: KitchenQueueDiningArea | null;
  items: Omit<KitchenQueueItem, "order">[];
}

// Socket.io "order-item:note-updated" payload — same shape as "order-item:new", sent the
// same way, when a note on items this kitchen already has was added, changed or removed
// (each item carries its current notes/dealOrderLine.notes). Never sent for SERVED items.
export type NoteUpdatedOrderItemsSocketPayload = NewOrderItemsSocketPayload;

// Socket.io "order-item:updated" payload, and the PATCH .../status response —
// leaner than KitchenQueueItem (no menuItem, no diningArea), so callers should
// only read `status` off this and merge it into an item they already have.
export interface UpdatedOrderItemSocketPayload {
  id: string;
  orderId: string;
  menuItemId: string;
  kitchenId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  status: OrderItemStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  order: { id: string; orderNumber: number };
}

export const kitchenQueueApi = {
  get: async (kitchenId: string): Promise<KitchenQueueItem[]> => {
    const { data } = await apiClient.get<KitchenQueueItem[]>("/api/pos/kitchen-queue", {
      params: { kitchenId },
    });
    return data;
  },
  updateItemStatus: async (
    orderId: string,
    itemId: string,
    status: OrderItemStatus,
  ): Promise<UpdatedOrderItemSocketPayload> => {
    const { data } = await apiClient.patch<UpdatedOrderItemSocketPayload>(
      `/api/pos/orders/${orderId}/items/${itemId}/status`,
      { status },
    );
    return data;
  },
};

// "order:cancelled" (the whole order) and "order-item:removed" (one line taken off it) — each
// kitchen room gets only its own item ids; the Kitchen Display drops those cards.
export interface OrderItemsGoneSocketPayload {
  orderId: string;
  orderNumber: number;
  itemIds: string[];
}
