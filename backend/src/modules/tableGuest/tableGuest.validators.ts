import {
  CreateOrderDealInput,
  CreateOrderItemInput,
  InvalidOrderDealsError,
  InvalidOrderItemsError,
  parseOrderDeals,
  parseOrderItems,
} from "../order/order.service";
import { cleanText, MAX_LINE_QUANTITY, MAX_ORDER_LINES } from "../guestOrder/guestOrder.validators";

// Pure, strict parsing of the public Table QR bodies. Unknown keys are rejected; item and deal lines
// go through the same shared parsers as every other order route, with their defaults — so a guest can
// never send a price (unitPrice) or a customized deal.

export class TableGuestValidationError extends Error {
  readonly code = "BAD_REQUEST";
}

const bad = (message: string) => new TableGuestValidationError(message);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PIN_PATTERN = /^\d{4}$/;

export const DISPLAY_NAME_MAX_LENGTH = 30;

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

function uuid(raw: unknown, field: string): string {
  if (typeof raw !== "string" || !UUID_PATTERN.test(raw)) {
    throw bad(`${field} must be a UUID`);
  }
  return raw.toLowerCase();
}

// ---------- POST /:qrKey/join ----------

export interface JoinInput {
  displayName: string;
  pin: string | undefined;
  joinRequestId: string;
}

export function parseJoinBody(body: unknown): JoinInput {
  const root = asObject(body, "body");
  rejectUnknownKeys(root, ["displayName", "pin", "joinRequestId"], "");
  const displayName = cleanText(root.displayName, "displayName", 1, DISPLAY_NAME_MAX_LENGTH);
  let pin: string | undefined;
  if (root.pin !== undefined && root.pin !== null && root.pin !== "") {
    if (typeof root.pin !== "string" || !PIN_PATTERN.test(root.pin)) {
      throw bad("pin must be 4 digits");
    }
    pin = root.pin;
  }
  return { displayName, pin, joinRequestId: uuid(root.joinRequestId, "joinRequestId") };
}

// ---------- POST /orders ----------

export interface TableOrderInput {
  clientRequestId: string;
  items: CreateOrderItemInput[];
  deals: CreateOrderDealInput[];
  notes: string | undefined;
}

const ITEM_KEYS = ["menuItemId", "quantity", "variantId", "addOnIds", "notes"];
const DEAL_KEYS = ["dealId", "quantity", "notes"];

function checkLines(raw: unknown, allowedKeys: string[], path: string): void {
  if (raw === undefined) {
    return;
  }
  if (!Array.isArray(raw)) {
    throw bad(`${path} must be an array`);
  }
  raw.forEach((line, index) => rejectUnknownKeys(asObject(line, `${path}[${index}]`), allowedKeys, `${path}[${index}].`));
}

export function parseTableOrderBody(body: unknown): TableOrderInput {
  const root = asObject(body, "body");
  rejectUnknownKeys(root, ["clientRequestId", "items", "deals", "notes"], "");
  const clientRequestId = uuid(root.clientRequestId, "clientRequestId");

  // Unknown keys inside a line (a "unitPrice", a "customization") are a 400 here, before the shared
  // parsers run, so a tampered line is refused outright rather than half-read.
  checkLines(root.items, ITEM_KEYS, "items");
  checkLines(root.deals, DEAL_KEYS, "deals");

  let items: CreateOrderItemInput[];
  let deals: CreateOrderDealInput[];
  try {
    items = parseOrderItems(root.items ?? []);
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

  let notes: string | undefined;
  if (root.notes !== undefined && root.notes !== null) {
    const cleaned = cleanText(root.notes, "notes", 0, 200);
    notes = cleaned.length > 0 ? cleaned : undefined;
  }
  return { clientRequestId, items, deals, notes };
}

// ---------- POST /calls ----------

export const CALL_TYPES = ["WATER", "NAPKINS", "BILL_CASH", "OTHER"] as const;
export type CallType = (typeof CALL_TYPES)[number];
export const CALL_NOTE_MAX_LENGTH = 80;

export interface TableCallInput {
  clientRequestId: string;
  type: CallType;
  note: string | undefined;
}

// A note is required for OTHER (staff need to know what for) and optional otherwise; at most 80
// characters after cleaning, so it fits a toast on a waiter's phone.
export function parseTableCallBody(body: unknown): TableCallInput {
  const root = asObject(body, "body");
  rejectUnknownKeys(root, ["clientRequestId", "type", "note"], "");
  const clientRequestId = uuid(root.clientRequestId, "clientRequestId");
  if (typeof root.type !== "string" || !(CALL_TYPES as readonly string[]).includes(root.type)) {
    throw bad(`type must be one of: ${CALL_TYPES.join(", ")}`);
  }
  const type = root.type as CallType;
  let note: string | undefined;
  if (root.note !== undefined && root.note !== null) {
    const cleaned = cleanText(root.note, "note", 0, CALL_NOTE_MAX_LENGTH);
    note = cleaned.length > 0 ? cleaned : undefined;
  }
  if (type === "OTHER" && note === undefined) {
    throw bad("note is required when type is OTHER");
  }
  return { clientRequestId, type, note };
}
