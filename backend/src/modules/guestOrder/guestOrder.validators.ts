import { PaymentMethod } from "../../../generated/prisma/client";
import { normalizePkPhone } from "../../common/phone";
import {
  CreateOrderDealInput,
  CreateOrderItemInput,
  InvalidOrderDealsError,
  InvalidOrderItemsError,
  parseOrderDeals,
  parseOrderItems,
} from "../order/order.service";

// Pure, strict parsing of POST /api/online/guest-orders. Anything not listed is rejected; the item
// and deal lines themselves go through the SAME shared parsers (and so the same rules: no
// client-sent price, no deal customization) as every other order route.

export type GuestErrorCode = "BAD_REQUEST" | "BAD_PHONE";

export class GuestOrderValidationError extends Error {
  constructor(
    public readonly code: GuestErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const MAX_ORDER_LINES = 40;
export const MAX_LINE_QUANTITY = 50;
// Business policy: a single guest order can't exceed this (checked against the priced total).
export const MAX_ORDER_TOTAL = 200_000;

const TOP_LEVEL_KEYS = ["clientRequestId", "orderType", "items", "deals", "customer", "notes", "paymentMethod", "website"];
const CUSTOMER_KEYS = ["name", "phone", "deliveryAreaId", "otherArea", "house", "street", "landmark"];
const ITEM_KEYS = ["menuItemId", "quantity", "variantId", "addOnIds", "notes"];
const DEAL_KEYS = ["dealId", "quantity", "notes"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GuestOrderType = "DELIVERY" | "PICKUP";

interface GuestOrderCommon {
  clientRequestId: string;
  items: CreateOrderItemInput[];
  deals: CreateOrderDealInput[];
  notes: string | undefined;
  paymentMethod: "CASH" | "ONLINE";
}

interface GuestCustomer {
  name: string;
  phone: string;
}

// Exactly one of deliveryAreaId (a listed area: sets the fee and minimum) or otherArea (the customer's
// own text when their area isn't listed: no fee or minimum, staff confirm the fee by phone) is set.
export interface GuestDeliveryDetails {
  deliveryAreaId: string | undefined;
  otherArea?: string | undefined;
  house: string;
  street: string;
  landmark: string | undefined;
}

// A pickup order carries only the customer's name and phone: no area, no address.
export type GuestOrderInput =
  | (GuestOrderCommon & { orderType: "DELIVERY"; customer: GuestCustomer & GuestDeliveryDetails })
  | (GuestOrderCommon & { orderType: "PICKUP"; customer: GuestCustomer });

export type ParsedGuestOrder = { kind: "honeypot" } | { kind: "order"; order: GuestOrderInput };

const bad = (message: string) => new GuestOrderValidationError("BAD_REQUEST", message);

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw bad(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(object: Record<string, unknown>, allowed: string[], path: string): void {
  const unknown = Object.keys(object).find((key) => !allowed.includes(key));
  if (unknown !== undefined) {
    throw bad(`${path}${unknown} is not a recognised field`);
  }
}

// Single-line text: control characters (newlines, tabs, NULs) become spaces and runs of whitespace
// collapse, so a name or address can't break a printed slip or smuggle in a line break.
export function cleanText(raw: unknown, field: string, min: number, max: number): string {
  if (typeof raw !== "string") {
    throw bad(`${field} must be a string`);
  }
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length < min || cleaned.length > max) {
    throw bad(min === max ? `${field} must be ${min} characters` : `${field} must be ${min}-${max} characters`);
  }
  return cleaned;
}

function optionalText(raw: unknown, field: string, max: number): string | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const cleaned = cleanText(raw, field, 0, max);
  return cleaned.length > 0 ? cleaned : undefined;
}

function checkLines(raw: unknown, allowedKeys: string[], path: string): void {
  if (raw === undefined) {
    return;
  }
  if (!Array.isArray(raw)) {
    throw bad(`${path} must be an array`);
  }
  raw.forEach((line, index) => {
    rejectUnknownKeys(asObject(line, `${path}[${index}]`), allowedKeys, `${path}[${index}].`);
  });
}

export function parseGuestOrderBody(body: unknown): ParsedGuestOrder {
  const root = asObject(body, "body");

  // The honeypot is checked before anything else: a bot that filled the hidden field gets no
  // validation feedback at all.
  if (typeof root.website === "string" && root.website.trim().length > 0) {
    return { kind: "honeypot" };
  }
  rejectUnknownKeys(root, TOP_LEVEL_KEYS, "");
  if (root.website !== undefined && typeof root.website !== "string") {
    throw bad("website must be a string");
  }

  if (typeof root.clientRequestId !== "string" || !UUID_PATTERN.test(root.clientRequestId)) {
    throw bad("clientRequestId must be a UUID");
  }
  if (root.paymentMethod !== PaymentMethod.CASH && root.paymentMethod !== PaymentMethod.ONLINE) {
    throw bad("paymentMethod must be CASH or ONLINE");
  }

  // Old clients send no orderType and keep getting a delivery order.
  let orderType: GuestOrderType = "DELIVERY";
  if (root.orderType !== undefined) {
    if (root.orderType !== "DELIVERY" && root.orderType !== "PICKUP") {
      throw bad("orderType must be DELIVERY or PICKUP");
    }
    orderType = root.orderType;
  }

  const rawCustomer = asObject(root.customer, "customer");
  rejectUnknownKeys(rawCustomer, CUSTOMER_KEYS, "customer.");
  const name = cleanText(rawCustomer.name, "customer.name", 2, 60);
  const phone = normalizePkPhone(rawCustomer.phone);
  if (phone === null) {
    throw new GuestOrderValidationError(
      "BAD_PHONE",
      "customer.phone must be a Pakistani mobile number like 03001234567 or +923001234567",
    );
  }
  // Pickup ignores the delivery fields entirely (a stale client may still send them), so they are not even type-checked.
  let delivery: GuestDeliveryDetails | null = null;
  if (orderType === "DELIVERY") {
    const hasAreaId = rawCustomer.deliveryAreaId !== undefined && rawCustomer.deliveryAreaId !== null;
    const hasOtherArea = rawCustomer.otherArea !== undefined && rawCustomer.otherArea !== null;
    if (hasAreaId === hasOtherArea) {
      throw bad("send either customer.deliveryAreaId or customer.otherArea");
    }
    let deliveryAreaId: string | undefined;
    let otherArea: string | undefined;
    if (hasAreaId) {
      if (typeof rawCustomer.deliveryAreaId !== "string" || rawCustomer.deliveryAreaId.length === 0 || rawCustomer.deliveryAreaId.length > 64) {
        throw bad("customer.deliveryAreaId is required");
      }
      deliveryAreaId = rawCustomer.deliveryAreaId;
    } else {
      otherArea = cleanText(rawCustomer.otherArea, "customer.otherArea", 2, 60);
    }
    delivery = {
      deliveryAreaId,
      otherArea,
      house: cleanText(rawCustomer.house, "customer.house", 1, 60),
      street: cleanText(rawCustomer.street, "customer.street", 2, 120),
      landmark: optionalText(rawCustomer.landmark, "customer.landmark", 100),
    };
  }
  const notes = optionalText(root.notes, "notes", 200);

  checkLines(root.items, ITEM_KEYS, "items");
  checkLines(root.deals, DEAL_KEYS, "deals");

  let items: CreateOrderItemInput[];
  let deals: CreateOrderDealInput[];
  try {
    items = parseOrderItems(root.items);
    deals = parseOrderDeals(root.deals);
  } catch (error) {
    if (error instanceof InvalidOrderItemsError || error instanceof InvalidOrderDealsError) {
      throw bad(error.message);
    }
    throw error;
  }

  if (items.length + deals.length === 0) {
    throw bad("The order must include at least one item or deal");
  }
  if (items.length + deals.length > MAX_ORDER_LINES) {
    throw bad(`An order can have at most ${MAX_ORDER_LINES} lines`);
  }
  for (const line of [...items, ...deals]) {
    if (line.quantity > MAX_LINE_QUANTITY) {
      throw bad(`quantity must be between 1 and ${MAX_LINE_QUANTITY}`);
    }
  }

  const common = {
    clientRequestId: root.clientRequestId.toLowerCase(),
    items,
    deals,
    notes,
    paymentMethod: root.paymentMethod,
  };
  return {
    kind: "order",
    order:
      delivery === null
        ? { ...common, orderType: "PICKUP", customer: { name, phone } }
        : { ...common, orderType: "DELIVERY", customer: { name, phone, ...delivery } },
  };
}

// "House 12, Street 5, DHA Phase 2", plus "Landmark: ..." on a new line when given.
export function buildDeliveryAddress(parts: {
  house: string;
  street: string;
  areaName: string;
  landmark: string | undefined;
}): string {
  const base = `House ${parts.house}, ${parts.street}, ${parts.areaName}`;
  return parts.landmark ? `${base}\nLandmark: ${parts.landmark}` : base;
}
