import { apiClient } from "./client";
import type { DiningAreaType } from "./diningAreas";

// TABLE_QR = a round a guest sent from the table's QR (docs/TABLE_QR_SPEC.md); reviewed at reception
// exactly like an order-taker order.
export type OrderSource = "POS" | "ONLINE" | "PHONE" | "ORDER_TAKER" | "TABLE_QR";
export type OrderType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "IN_KITCHEN"
  | "READY"
  | "COMPLETED"
  | "CANCELLED"
  | "AWAITING_RECEPTION"
  // A POS order placed "for later" — on hold (not in Incoming, no kitchen, no stock, no
  // printing) until scheduledFor, then released to AWAITING_RECEPTION exactly once.
  | "SCHEDULED";
export type OrderItemStatus = "PENDING" | "PREPARING" | "READY" | "SERVED";
export type PaymentMethod = "CASH" | "ONLINE";
export type PaymentStatus = "PENDING" | "AWAITING_VERIFICATION" | "VERIFIED" | "REJECTED";
export type OrderChangeKind = "EDIT" | "CANCEL";
export type OrderChangeStatus = "APPLIED" | "PENDING" | "APPROVED" | "REJECTED";

export interface OrderDiningArea {
  id: string;
  name: string;
  type: DiningAreaType;
  // The table's room/section ("Family Hall") — null for none.
  area: string | null;
  capacity: number | null;
  isActive: boolean;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  menuItem: { id: string; name: string };
  kitchenId: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  status: OrderItemStatus;
  // Per-line kitchen note ("no onion") — trimmed, at most LINE_NOTE_MAX_LENGTH characters,
  // null for none. Always null on a deal-exploded item: its note is dealOrderLine.notes.
  notes: string | null;
  // True for a line whose unitPrice was typed by the cashier at order time (an
  // open-price menu item) rather than resolved from the menu/variant.
  isCustomPrice: boolean;
  // Set only on items exploded out of a deal's composition (unitPrice/subtotal
  // are then "0"); null for everything ordered directly. Equal to the matching
  // entry's id in OrderDetail.dealLines below.
  dealOrderLineId: string | null;
  // Denormalized alongside dealOrderLineId so a screen can show "Part of {deal}" (and
  // whether it's customized) without cross-referencing OrderDetail.dealLines. Present
  // everywhere OrderItem appears (order detail, kitchen queue, the order-item:new
  // socket payload) — null unless dealOrderLineId is set. `notes` is the whole deal line's
  // note, shown under every item exploded from it.
  dealOrderLine: OrderItemDealLineInfo | null;
  // Which size this line was ordered at, if the item is sized — both null for a plain
  // item. Snapshotted at order time, so these never change even if the size is later
  // renamed/repriced/deleted.
  variantId: string | null;
  variantLabel: string | null;
  // Snapshotted at order time like variantLabel — null means no add-ons on this line.
  // unitPrice/subtotal already include each add-on's price, summed in once at order time.
  addOns: { addOnId: string; name: string; price: string }[] | null;
  // Table QR: the guest whose round added this line; null for a staff-added line ("Table (shared)")
  // and for every non-QR order.
  tableGuest?: OrderTableGuest | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderTableGuest {
  id: string;
  displayName: string;
}

export interface OrderItemDealLineInfo {
  dealName: string;
  customization: OrderDealLineCustomization | null;
  notes: string | null;
}

// A readable snapshot of exactly what a customized deal line's items ended up being —
// mirrors backend/src/modules/order/order.service.ts's CreateDealCustomizationInput.
export interface OrderDealLineCustomizationItem {
  menuItemId: string;
  name: string;
  variantLabel?: string;
  quantity: number;
  addOns: { name: string; price: string }[];
}

export interface OrderDealLineCustomization {
  reason?: string;
  items: OrderDealLineCustomizationItem[];
}

// One row per deal line ordered — the deal's own price/quantity, snapshotted
// name included (survives a later deal deletion).
export interface OrderDealLine {
  id: string;
  orderId: string;
  dealId: string | null;
  dealName: string;
  quantity: number;
  unitPrice: string;
  subtotal: string;
  // The deal's standard price at order time; null for every line ordered before this
  // field existed. customization is null for a standard (unmodified) deal line.
  baseUnitPrice: string | null;
  customization: OrderDealLineCustomization | null;
  // Note for the deal line as a whole — same rules as OrderItem.notes.
  notes: string | null;
  // Table QR: as OrderItem.tableGuest.
  tableGuest?: OrderTableGuest | null;
  createdAt: string;
}

// Common to both the list endpoint (bare rows) and the detail endpoint.
interface OrderBase {
  id: string;
  orderNumber: number;
  businessDayId: string;
  source: OrderSource;
  type: OrderType;
  diningAreaId: string | null;
  waiterId: string | null;
  riderId: string | null;
  customerId: string | null;
  customerAddressId: string | null;
  deliveryAddress: string | null;
  // Guest checkout (no Customer account): who it's for and where it goes, read straight from the
  // order. publicCode is the 5-character code a guest reads out over the phone; null for every
  // non-guest order. deliveryFee is already included in totalAmount.
  customerName: string | null;
  customerPhone: string | null;
  deliveryAreaId: string | null;
  deliveryFee: string;
  publicCode: string | null;
  // Set when staff marked an accepted pickup order "Not collected" (cancelled, and a strike for the phone).
  notCollectedAt: string | null;
  // The guest's payment proof (stored in Postgres, shown through GET /:id/payment-proof).
  paymentProofMediaId: string | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentScreenshotUrl: string | null;
  paymentVerifiedById: string | null;
  placedByStaffId: string | null;
  // Set only when reception accepts an AWAITING_RECEPTION order.
  acceptedById: string | null;
  acceptedAt: string | null;
  // Idempotency key used by the order-taker submit flow — null for every other order.
  clientRequestId: string | null;
  // UTC ISO strings (shown in Pakistan time). scheduledFor is set only on an order placed
  // with "Schedule for later" (kept after release); releasedAt once it has been released.
  scheduledFor: string | null;
  releasedAt: string | null;
  totalAmount: string;
  discount: string;
  // Set only once a CASH order's payment is confirmed (see updatePaymentStatus); null before
  // that and cleared back to null if payment is reversed to PENDING.
  paidAmount: string | null;
  // Why the discount was given (phase 1); who and when are in the order's History.
  discountReason: string | null;
  notes: string | null;
  cancelledReason: string | null;
  createdAt: string;
  updatedAt: string;
}

// GET /orders — bare rows plus each item's status (what the display status is derived from).
export interface OrderSummary extends OrderBase {
  items?: { status: OrderItemStatus }[];
}

// GET /orders/:id, and every write endpoint's response — includes items + diningArea.
export interface OrderDetail extends OrderBase {
  diningArea: OrderDiningArea | null;
  // Guest orders: the delivery area picked at checkout.
  deliveryArea: { id: string; nameEn: string; nameUr: string } | null;
  items: OrderItem[];
  dealLines: OrderDealLine[];
  // Who placed it (staff-placed/order-taker orders only) and the online customer/address
  // it was placed for (online orders only) — both null when not applicable.
  placedByStaff: { id: string; name: string } | null;
  customer: { id: string; name: string; phone: string } | null;
  customerAddress: { id: string; addressText: string } | null;
  // Table QR rounds only: the table's session and the guest who sent the round.
  tableSession?: { id: string; diningAreaId: string; status: "OPEN" | "CLOSED" | "VOIDED" } | null;
  tableGuest?: OrderTableGuest | null;
}

export interface ListOrdersFilter {
  businessDayId?: string;
  status?: OrderStatus;
  source?: OrderSource;
  diningAreaId?: string;
}

export interface CreateOrderInput {
  type: OrderType;
  paymentMethod: PaymentMethod;
  diningAreaId?: string;
  deliveryAddress?: string;
  waiterId?: string;
  riderId?: string;
  // "Schedule for later": a UTC ISO time, in the future and at most 24 hours ahead.
  scheduledFor?: string;
  items: {
    menuItemId: string;
    quantity: number;
    notes?: string;
    variantId?: string;
    addOnIds?: string[];
    // Staff-only — the POS route accepts this (required for an open-price item,
    // rejected for every other item); the online route always rejects it with 400.
    unitPrice?: number;
  }[];
  deals?: {
    dealId: string;
    quantity: number;
    notes?: string;
    // Staff-only — the POS route accepts this; the online order route rejects it
    // with 400 (see backend/src/modules/payment/payment.controller.ts).
    customization?: {
      items: { menuItemId: string; quantity: number; variantId?: string; addOnIds?: string[] }[];
      finalPrice: number;
      reason?: string;
    };
  }[];
}

export interface AssignOrderInput {
  waiterId?: string;
  riderId?: string;
  diningAreaId?: string;
}

export interface AddOrderItemsInput {
  items: { menuItemId: string; quantity: number; notes?: string; variantId?: string; addOnIds?: string[] }[];
}

// GET /orders/incoming — reception's inbox.
export interface IncomingOrdersResponse {
  count: number;
  orders: OrderDetail[];
}

export interface OrderChange {
  id: string;
  orderId: string;
  requestedById: string;
  reviewedById: string | null;
  kind: OrderChangeKind;
  status: OrderChangeStatus;
  reason: string | null;
  rejectionReason: string | null;
  previousState: Record<string, unknown>;
  requestedState: Record<string, unknown> | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: { id: string; name: string };
  reviewedBy?: { id: string; name: string } | null;
  order: Pick<OrderDetail, "id" | "orderNumber" | "status" | "updatedAt">;
}

// GET /changes/incoming carries the order in full (its state before the change), not the
// trimmed Pick above — used to tell which items an approved edit added.
export interface IncomingOrderChange extends Omit<OrderChange, "order"> {
  order: OrderDetail;
}

export interface ReviewedOrderChange {
  change: OrderChange;
  order: OrderDetail | null;
}

export interface CreateOrderChangeInput {
  kind: OrderChangeKind;
  items?: AddOrderItemsInput["items"];
  deals?: CreateOrderInput["deals"];
  notes?: string;
  reason?: string;
}

export interface AcceptOrderInput {
  paymentMethod?: PaymentMethod;
  // Non-negative, replaces the order's current discount and recomputes its total.
  discount?: number;
  // Required when the discount changes to above 0 (1-200 characters).
  discountReason?: string;
  // Required (and must be true) to accept an ONLINE-sourced, ONLINE-paid order — confirms
  // reception checked the payment screenshot before sending it to the kitchen.
  paymentVerified?: boolean;
}

export interface RejectOrderInput {
  reason: string;
  // Also marks the payment REJECTED — for a bad/unreadable payment screenshot.
  paymentRejected?: boolean;
}

// PUT /:id/submission — replaces an AWAITING_RECEPTION order's contents wholesale. Same
// item/deal shape CreateOrderInput already uses, reused rather than reinvented.
export interface UpdateSubmissionInput {
  items: CreateOrderInput["items"];
  deals?: CreateOrderInput["deals"];
  notes?: string;
  paymentMethod?: PaymentMethod;
  discount?: number;
}

// POST /submit — an ORDER_TAKER's own dine-in order, waiting at reception until
// POS_ADMIN/SUPER_ADMIN accepts it. No paymentMethod/discount — those are reception's
// call, made at accept time.
export interface SubmitOrderInput {
  diningAreaId: string;
  items: CreateOrderInput["items"];
  deals?: CreateOrderInput["deals"];
  notes?: string;
  // Idempotency key — the same value on a retry (double tap, dropped response) returns
  // the already-created order instead of creating a second one.
  clientRequestId: string;
}

// PUT /:id/scheduled-items — the same item/deal shape as creating the order.
export interface UpdateScheduledItemsInput {
  items: CreateOrderInput["items"];
  deals?: CreateOrderInput["deals"];
}

export type OrderEventType =
  | "CANCELLED"
  | "DISCOUNT_SET"
  | "PAYMENT_MARKED"
  | "PAYMENT_UNMARKED"
  | "ITEM_REMOVED"
  | "ITEM_ADDED"
  | "ACCEPTED"
  | "REJECTED";

// One row of an order's audit trail (GET /orders/:id/events). before/after hold only the fields
// the action changed; money in them is a string, like everywhere else in the API.
export interface OrderEvent {
  id: string;
  type: OrderEventType;
  reason: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
}

export const ordersApi = {
  listEvents: async (id: string): Promise<OrderEvent[]> => {
    const { data } = await apiClient.get<OrderEvent[]>(`/api/pos/orders/${id}/events`);
    return data;
  },
  list: async (filter: ListOrdersFilter = {}): Promise<OrderSummary[]> => {
    const { data } = await apiClient.get<OrderSummary[]>("/api/pos/orders", { params: filter });
    return data;
  },
  get: async (id: string): Promise<OrderDetail> => {
    const { data } = await apiClient.get<OrderDetail>(`/api/pos/orders/${id}`);
    return data;
  },
  create: async (input: CreateOrderInput): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>("/api/pos/orders", input);
    return data;
  },
  cancel: async (id: string, cancelledReason: string): Promise<OrderDetail> => {
    const { data } = await apiClient.patch<OrderDetail>(`/api/pos/orders/${id}/cancel`, { cancelledReason });
    return data;
  },
  assign: async (id: string, input: AssignOrderInput): Promise<OrderDetail> => {
    const { data } = await apiClient.patch<OrderDetail>(`/api/pos/orders/${id}/assign`, input);
    return data;
  },
  // Quick POS toggle (pay-after-eating): PENDING <-> VERIFIED only. The online
  // screenshot-verification flow (AWAITING_VERIFICATION/REJECTED) is separate. `discount`
  // replaces the order's discount and recomputes its total server-side; `paidAmount` records
  // how much cash was actually handed over. Both optional — omit to leave them unchanged.
  updatePaymentStatus: async (
    id: string,
    paymentStatus: "PENDING" | "VERIFIED",
    // discountReason: required when `discount` changes to above 0 (1-200 characters).
    options?: { discount?: number; discountReason?: string; paidAmount?: number },
  ): Promise<OrderDetail> => {
    const { data } = await apiClient.patch<OrderDetail>(`/api/pos/orders/${id}/payment-status`, {
      paymentStatus,
      ...options,
    });
    return data;
  },
  addItems: async (id: string, input: AddOrderItemsInput): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>(`/api/pos/orders/${id}/items`, input);
    return data;
  },
  removeItem: async (id: string, itemId: string): Promise<OrderDetail> => {
    const { data } = await apiClient.delete<OrderDetail>(`/api/pos/orders/${id}/items/${itemId}`);
    return data;
  },
  // Sets/changes a note on a directly-ordered item; null (or "") removes it. Pushes the
  // change to the item's kitchen unless it's already been served.
  updateItemNote: async (id: string, itemId: string, notes: string | null): Promise<OrderDetail> => {
    const { data } = await apiClient.patch<OrderDetail>(`/api/pos/orders/${id}/items/${itemId}/notes`, { notes });
    return data;
  },
  // Same for a whole deal line — every item exploded from it shows this note.
  updateDealLineNote: async (id: string, dealLineId: string, notes: string | null): Promise<OrderDetail> => {
    const { data } = await apiClient.patch<OrderDetail>(`/api/pos/orders/${id}/deal-lines/${dealLineId}/notes`, {
      notes,
    });
    return data;
  },
  exportXlsx: async (filter: ListOrdersFilter = {}): Promise<Blob> => {
    const { data } = await apiClient.get<Blob>("/api/pos/orders", {
      params: { ...filter, export: "xlsx" },
      responseType: "blob",
    });
    return data;
  },
  // Optionally narrowed to one guest order by the 5-character code a customer reads out over the phone.
  getIncoming: async (code?: string): Promise<IncomingOrdersResponse> => {
    const { data } = await apiClient.get<IncomingOrdersResponse>("/api/pos/orders/incoming", {
      ...(code !== undefined ? { params: { code } } : {}),
    });
    return data;
  },
  accept: async (id: string, input: AcceptOrderInput): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>(`/api/pos/orders/${id}/accept`, input);
    return data;
  },
  reject: async (id: string, input: RejectOrderInput): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>(`/api/pos/orders/${id}/reject`, input);
    return data;
  },
  // An accepted online pickup order the customer never came for: cancelled with the reason "Not collected" and a
  // strike against the phone (3 in 90 days stops new online orders from it). 409 unless a pickup order is accepted and open.
  markNotCollected: async (id: string): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>(`/api/pos/orders/${id}/not-collected`);
    return data;
  },
  // Finish a paid, accepted (PENDING/CONFIRMED) order of any source and type -> COMPLETED; its items
  // leave the kitchen screens. 409 code UNPAID until payment is confirmed, NOT_COMPLETABLE otherwise.
  complete: async (id: string): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>(`/api/pos/orders/${id}/complete`);
    return data;
  },
  // The order has been handed over / delivered -> COMPLETED. 409 unless it's accepted and still open.
  markDelivered: async (id: string): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>(`/api/pos/orders/${id}/delivered`);
    return data;
  },
  // A guest's payment proof. Staff-only and token-authenticated, so it's fetched as a blob (an
  // <img src> can't send the Authorization header) — see useProofImageUrl.
  getPaymentProof: async (id: string, size: "thumb" | "full"): Promise<Blob> => {
    const { data } = await apiClient.get<Blob>(`/api/pos/orders/${id}/payment-proof`, {
      params: { size },
      responseType: "blob",
    });
    return data;
  },
  updateSubmission: async (id: string, input: UpdateSubmissionInput): Promise<OrderDetail> => {
    const { data } = await apiClient.put<OrderDetail>(`/api/pos/orders/${id}/submission`, input);
    return data;
  },
  // Scheduled orders (POS_ADMIN/SUPER_ADMIN). Every action 409s once the order is no longer
  // SCHEDULED (e.g. it was just released).
  listScheduled: async (): Promise<OrderDetail[]> => {
    const { data } = await apiClient.get<OrderDetail[]>("/api/pos/orders/scheduled");
    return data;
  },
  releaseScheduled: async (id: string): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>(`/api/pos/orders/${id}/release`);
    return data;
  },
  reschedule: async (id: string, scheduledFor: string): Promise<OrderDetail> => {
    const { data } = await apiClient.patch<OrderDetail>(`/api/pos/orders/${id}/schedule`, { scheduledFor });
    return data;
  },
  updateScheduledItems: async (id: string, input: UpdateScheduledItemsInput): Promise<OrderDetail> => {
    const { data } = await apiClient.put<OrderDetail>(`/api/pos/orders/${id}/scheduled-items`, input);
    return data;
  },
  cancelScheduled: async (id: string, reason?: string): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>(`/api/pos/orders/${id}/cancel-scheduled`, reason ? { reason } : {});
    return data;
  },
  submit: async (input: SubmitOrderInput): Promise<OrderDetail> => {
    const { data } = await apiClient.post<OrderDetail>("/api/pos/orders/submit", input);
    return data;
  },
  listChanges: async (id: string): Promise<OrderChange[]> => {
    const { data } = await apiClient.get<OrderChange[]>(`/api/pos/orders/${id}/changes`);
    return data;
  },
  createChange: async (id: string, input: CreateOrderChangeInput): Promise<OrderChange> => {
    const { data } = await apiClient.post<OrderChange>(`/api/pos/orders/${id}/changes`, input);
    return data;
  },
  getIncomingChanges: async (): Promise<IncomingOrderChange[]> => {
    const { data } = await apiClient.get<IncomingOrderChange[]>("/api/pos/orders/changes/incoming");
    return data;
  },
  reviewChange: async (changeId: string, approved: boolean, rejectionReason?: string): Promise<ReviewedOrderChange> => {
    const { data } = await apiClient.patch<ReviewedOrderChange>(`/api/pos/orders/changes/${changeId}/review`, {
      approved,
      ...(rejectionReason !== undefined ? { rejectionReason } : {}),
    });
    return data;
  },
};
