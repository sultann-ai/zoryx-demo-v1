import {
  OrderItemStatus,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentMethod,
  PaymentStatus,
  OrderChangeKind,
  OrderChangeStatus,
  OrderEventType,
  Prisma,
  StaffRole,
} from "../../../generated/prisma/client";
import { prisma } from "../../config/prisma";
import { getIO } from "../../config/socket";
import { computeOrderTotal } from "../../common/orderTotals";
import * as inventoryService from "../inventory/inventory.service";
import { money, recordOrderEvent } from "./orderEvents";
import { isPaid } from "../reports/salesDefinitions";

export class NoActiveBusinessDayError extends Error {}

export class MenuItemNotFoundError extends Error {
  constructor(public readonly menuItemId: string) {
    super(`MenuItem ${menuItemId} not found`);
  }
}

export class DealNotFoundError extends Error {
  constructor(public readonly dealId: string) {
    super(`Deal ${dealId} not found`);
  }
}

export class InvalidOrderItemsError extends Error {}

// A guest/online order named something the website doesn't offer: an item or deal that is hidden
// online, deal-only, or (for a deal) inactive or empty.
export class ItemNotOrderableOnlineError extends Error {}

// The priced items+deals came to less than the delivery area's minimum order amount.
export class BelowMinimumError extends Error {
  constructor(public readonly minOrderAmount: Prisma.Decimal) {
    super(`Order is below the minimum of ${minOrderAmount.toString()}`);
  }
}

// The priced total exceeded the policy cap for a single order.
export class OrderTooLargeError extends Error {}

// A create-time guard (e.g. the guest-order rate limits) refused the order.
export class OrderGuardRejectedError extends Error {}

export class InvalidOrderDealsError extends Error {}

export class EmptyOrderError extends Error {}

export class EmployeeNotFoundOrInactiveError extends Error {
  constructor(public readonly employeeId: string) {
    super(`Employee ${employeeId} not found or inactive`);
  }
}

export class OrderNotFoundError extends Error {}

export class OrderClosedError extends Error {}

export class OrderItemNotFoundError extends Error {}

export class DealOrderItemError extends Error {}

export class OrderItemNotPendingError extends Error {}
export class OrderDealLineNotFoundError extends Error {}
export class InvalidLineNoteError extends Error {}
export class OrderChangeNotFoundError extends Error {}
export class OrderChangeStaleError extends Error {}
export class OrderChangeAlreadyReviewedError extends Error {}

// Thrown when an operation that requires the order to still be AWAITING_RECEPTION
// (submission edit, accept, reject) is attempted on an order that isn't — e.g. a
// double-accept, or editing via /submission after reception already acted on it.
export class OrderNotAwaitingReceptionError extends Error {}

// Thrown when an operation that requires the order to NOT be AWAITING_RECEPTION
// (adding/removing items, item-status updates — all of which go through the normal
// kitchen flow) is attempted on one that still is — editing an awaiting order only
// ever happens through PUT /:id/submission.
export class OrderAwaitingReceptionError extends Error {}

// Thrown when an operation that only makes sense for a live order (adding/removing items,
// note edits, kitchen status changes) is attempted on one still SCHEDULED — on hold, so
// nothing about it may reach a kitchen or move stock until it's released.
export class OrderScheduledError extends Error {}

// Thrown by the scheduled-order actions (release now, reschedule, edit items, cancel) when
// the order exists but is no longer SCHEDULED — typically because it was just released.
export class OrderNotScheduledError extends Error {}

export class InvalidScheduleError extends Error {}

// Thrown by submitOrderTakerOrder when a clientRequestId already exists but was
// submitted by a different staff member — never silently returns someone else's order.
export class ClientRequestIdConflictError extends Error {}

// Thrown by acceptOrder when an online order paid ONLINE is accepted without
// paymentVerified: true — the cashier must look at the screenshot first.
export class PaymentNotVerifiedError extends Error {}

// Thrown by acceptOrder for a guest order paid ONLINE that has no payment proof on file yet.
export class PaymentProofMissingError extends Error {}

// Thrown by markOrderDelivered when the order isn't in a state that can be finished.
export class OrderNotDeliverableError extends Error {
  constructor(public readonly status: OrderStatus) {
    super(`Order is ${status} and cannot be marked delivered`);
  }
}

async function requireActiveEmployee(id: string): Promise<void> {
  const employee = await prisma.employee.findUnique({ where: { id }, select: { isActive: true } });
  if (!employee || !employee.isActive) {
    throw new EmployeeNotFoundOrInactiveError(id);
  }
}

// Shared shape underneath both a normal order line (parseOrderItems) and a customized
// deal's chosen contents (parseOrderDeals's customization.items) — "same shared rules as
// normal order lines" for both. The error class is passed in so a failure inside
// deals[i].customization.items[j] surfaces as an InvalidOrderDealsError (the array it's
// actually nested under), while a normal items[i] failure stays an InvalidOrderItemsError.
const DECIMAL_UP_TO_2_PLACES = /^\d+(\.\d{1,2})?$/;

// Business policy, not a column limit — Decimal(10,2) could hold far more. Keeps a
// typo (an extra zero) from becoming an enormous line.
const UNIT_PRICE_HARD_CAP = new Prisma.Decimal(1_000_000);

interface ParsedItemFields {
  menuItemId: string;
  quantity: number;
  variantId?: string;
  addOnIds?: string[];
  // Only ever set when the caller passed allowUnitPrice — see parseItemFields.
  unitPrice?: Prisma.Decimal;
}

interface ParseItemFieldsOptions {
  // True only for a normal order line (parseOrderItems) on the POS route — the one
  // place a client may price its own line, and only because the menu item it names
  // turns out to be open-price (resolveItemPrice is what actually enforces that; this
  // flag just controls whether the field is even allowed through the door at all).
  allowUnitPrice: boolean;
}

function parseItemFields(
  raw: unknown,
  path: string,
  ErrorClass: new (message: string) => Error,
  options: ParseItemFieldsOptions = { allowUnitPrice: false },
): ParsedItemFields {
  if (typeof raw !== "object" || raw === null) {
    throw new ErrorClass(`${path} must be an object`);
  }
  const { menuItemId, quantity, variantId, addOnIds, unitPrice } = raw as Record<string, unknown>;
  if (typeof menuItemId !== "string" || menuItemId.trim().length === 0) {
    throw new ErrorClass(`${path}.menuItemId is required`);
  }
  if (!Number.isInteger(quantity) || (quantity as number) <= 0) {
    throw new ErrorClass(`${path}.quantity must be a positive integer`);
  }
  // Only required for a sized item — resolveItemPrice/resolveDealCustomizationVariant
  // enforce that once the menu item itself has been looked up.
  if (variantId !== undefined && (typeof variantId !== "string" || variantId.trim().length === 0)) {
    throw new ErrorClass(`${path}.variantId must be a non-empty string`);
  }
  if (addOnIds !== undefined) {
    if (!Array.isArray(addOnIds) || addOnIds.some((id) => typeof id !== "string" || id.trim().length === 0)) {
      throw new ErrorClass(`${path}.addOnIds must be an array of non-empty strings`);
    }
    if (new Set(addOnIds).size !== addOnIds.length) {
      throw new ErrorClass(`${path}.addOnIds must not contain duplicates`);
    }
  }
  let unitPriceDecimal: Prisma.Decimal | undefined;
  if (unitPrice !== undefined) {
    if (!options.allowUnitPrice) {
      throw new ErrorClass(`${path}.unitPrice is not allowed here`);
    }
    if ((typeof unitPrice !== "string" && typeof unitPrice !== "number") || !DECIMAL_UP_TO_2_PLACES.test(String(unitPrice))) {
      throw new ErrorClass(`${path}.unitPrice must be a positive number with at most 2 decimal places`);
    }
    unitPriceDecimal = new Prisma.Decimal(unitPrice);
    if (unitPriceDecimal.lessThanOrEqualTo(0)) {
      throw new ErrorClass(`${path}.unitPrice must be greater than 0`);
    }
    if (unitPriceDecimal.greaterThan(UNIT_PRICE_HARD_CAP)) {
      throw new ErrorClass(`${path}.unitPrice must not exceed ${UNIT_PRICE_HARD_CAP.toString()}`);
    }
  }
  return {
    menuItemId,
    quantity: quantity as number,
    ...(variantId !== undefined ? { variantId } : {}),
    ...(addOnIds !== undefined ? { addOnIds: addOnIds as string[] } : {}),
    ...(unitPriceDecimal !== undefined ? { unitPrice: unitPriceDecimal } : {}),
  };
}

// A per-line kitchen instruction ("no onion", "extra spicy") — the same rule for a direct
// item (OrderItem.notes) and a whole deal line (OrderDealLine.notes), wherever one enters:
// order creation, adding items, a submission edit, or editing the note afterwards. Short on
// purpose: it has to fit legibly under the item on a kitchen slip.
export const ORDER_LINE_NOTE_MAX_LENGTH = 100;

// Returns the trimmed note, or null for "no note" (absent, null, or blank after trimming) —
// so a whitespace-only note is never stored, and sending "" or null clears an existing one.
export function parseLineNote(raw: unknown, path: string, ErrorClass: new (message: string) => Error): string | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "string") {
    throw new ErrorClass(`${path} must be a string`);
  }
  const trimmed = raw.trim();
  if (trimmed.length > ORDER_LINE_NOTE_MAX_LENGTH) {
    throw new ErrorClass(`${path} must be at most ${ORDER_LINE_NOTE_MAX_LENGTH} characters`);
  }
  return trimmed.length > 0 ? trimmed : null;
}

// "Schedule for later" may be at most this far ahead (and must be in the future).
export const SCHEDULE_MAX_AHEAD_MS = 24 * 60 * 60 * 1000;

// Validates a requested release time: an ISO-8601 string with an explicit offset or Z (the
// client converts the Pakistan wall-clock time it showed to UTC), strictly after `now` and
// no more than SCHEDULE_MAX_AHEAD_MS after it. Pure — `now` is passed in.
export function parseScheduledFor(raw: unknown, now: Date): Date {
  if (typeof raw !== "string" || !/(Z|[+-]\d{2}:?\d{2})$/.test(raw.trim())) {
    throw new InvalidScheduleError("scheduledFor must be an ISO date-time string with a time zone (e.g. ...Z)");
  }
  const scheduledFor = new Date(raw.trim());
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new InvalidScheduleError("scheduledFor is not a valid date-time");
  }
  if (scheduledFor.getTime() <= now.getTime()) {
    throw new InvalidScheduleError("scheduledFor must be in the future");
  }
  if (scheduledFor.getTime() - now.getTime() > SCHEDULE_MAX_AHEAD_MS) {
    throw new InvalidScheduleError("scheduledFor must be at most 24 hours from now");
  }
  return scheduledFor;
}

export interface ParseOrderItemsOptions {
  // Staff-only: a client-sent unitPrice only ever makes sense for an open-price menu
  // item, and the cashier is the one who decides it, not a customer. Defaults closed
  // (like parseOrderDeals's allowCustomization) so a future caller can't accidentally
  // let it through; only the POS route opts in. The online route must never pass true.
  allowUnitPrice: boolean;
}

// Shared by both order-creation entry points (POS and online) so item-shape
// validation lives in exactly one place. Unlike before deals existed, an empty
// or absent items array is no longer an error by itself — an order can now be
// composed entirely of deals. createOrder() is what enforces that the order
// as a whole (items + deals) isn't empty.
export function parseOrderItems(
  rawItems: unknown,
  options: ParseOrderItemsOptions = { allowUnitPrice: false },
): CreateOrderItemInput[] {
  if (rawItems === undefined) {
    return [];
  }
  if (!Array.isArray(rawItems)) {
    throw new InvalidOrderItemsError("items must be an array");
  }

  const parsed: CreateOrderItemInput[] = [];
  for (const [index, item] of rawItems.entries()) {
    const fields = parseItemFields(item, `items[${index}]`, InvalidOrderItemsError, options);
    const notes = parseLineNote((item as Record<string, unknown>).notes, `items[${index}].notes`, InvalidOrderItemsError);
    parsed.push({
      ...fields,
      ...(notes !== null ? { notes } : {}),
    });
  }
  return parsed;
}

const MAX_DEAL_CUSTOMIZATION_REASON_LENGTH = 200;

function parseFinalPrice(value: unknown, path: string): Prisma.Decimal {
  if ((typeof value !== "string" && typeof value !== "number") || !DECIMAL_UP_TO_2_PLACES.test(String(value))) {
    throw new InvalidOrderDealsError(`${path} must be a non-negative number with at most 2 decimal places`);
  }
  return new Prisma.Decimal(value);
}

function parseDealCustomization(raw: unknown, path: string): CreateDealCustomizationInput {
  if (typeof raw !== "object" || raw === null) {
    throw new InvalidOrderDealsError(`${path} must be an object`);
  }
  const { items, finalPrice, reason, ...rest } = raw as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    throw new InvalidOrderDealsError(`${path} has unknown field(s): ${Object.keys(rest).join(", ")}`);
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new InvalidOrderDealsError(`${path}.items must be a non-empty array`);
  }
  const parsedItems = items.map((item, index) =>
    parseItemFields(item, `${path}.items[${index}]`, InvalidOrderDealsError),
  );
  const finalPriceDecimal = parseFinalPrice(finalPrice, `${path}.finalPrice`);
  if (finalPriceDecimal.isNegative()) {
    throw new InvalidOrderDealsError(`${path}.finalPrice must be a non-negative number with at most 2 decimal places`);
  }

  let reasonValue: string | undefined;
  if (reason !== undefined) {
    if (typeof reason !== "string") {
      throw new InvalidOrderDealsError(`${path}.reason must be a string`);
    }
    const trimmed = reason.trim();
    if (trimmed.length > MAX_DEAL_CUSTOMIZATION_REASON_LENGTH) {
      throw new InvalidOrderDealsError(`${path}.reason must be at most ${MAX_DEAL_CUSTOMIZATION_REASON_LENGTH} characters`);
    }
    if (trimmed.length > 0) {
      reasonValue = trimmed;
    }
  }

  return {
    items: parsedItems,
    finalPrice: finalPriceDecimal,
    ...(reasonValue !== undefined ? { reason: reasonValue } : {}),
  };
}

export interface ParseOrderDealsOptions {
  // Staff-only: the price is the cashier's decision, never the client's in general. Closed
  // by default so a future caller of this shared parser can't accidentally let it through —
  // only the POS order route opts in; the online route must never pass true.
  allowCustomization: boolean;
}

// Sibling to parseOrderItems, but deals are optional — an absent or empty array means
// "no deals on this order", not a validation error.
export function parseOrderDeals(
  rawDeals: unknown,
  options: ParseOrderDealsOptions = { allowCustomization: false },
): CreateOrderDealInput[] {
  if (rawDeals === undefined) {
    return [];
  }
  if (!Array.isArray(rawDeals)) {
    throw new InvalidOrderDealsError("deals must be an array");
  }

  const parsed: CreateOrderDealInput[] = [];
  for (const [index, deal] of rawDeals.entries()) {
    if (typeof deal !== "object" || deal === null) {
      throw new InvalidOrderDealsError(`deals[${index}] must be an object`);
    }
    const { dealId, quantity, customization, finalPrice, notes: rawNotes } = deal as Record<string, unknown>;
    if (typeof dealId !== "string" || dealId.trim().length === 0) {
      throw new InvalidOrderDealsError(`deals[${index}].dealId is required`);
    }
    if (!Number.isInteger(quantity) || (quantity as number) <= 0) {
      throw new InvalidOrderDealsError(`deals[${index}].quantity must be a positive integer`);
    }
    // One note for the whole deal line (every unit of it, for a plain line of quantity > 1).
    const notes = parseLineNote(rawNotes, `deals[${index}].notes`, InvalidOrderDealsError);
    const notesField = notes !== null ? { notes } : {};
    // A bare finalPrice only ever makes sense attached to a specific set of customized
    // contents — never meaningful (or allowed) on its own.
    if (finalPrice !== undefined) {
      throw new InvalidOrderDealsError(`deals[${index}].finalPrice must be set inside customization`);
    }
    if (customization !== undefined) {
      if (!options.allowCustomization) {
        throw new InvalidOrderDealsError(`deals[${index}].customization is not allowed on this order route`);
      }
      if ((quantity as number) !== 1) {
        throw new InvalidOrderDealsError(`deals[${index}].quantity must be 1 when customization is set`);
      }
      parsed.push({
        dealId,
        quantity: quantity as number,
        customization: parseDealCustomization(customization, `deals[${index}].customization`),
        ...notesField,
      });
      continue;
    }
    parsed.push({ dealId, quantity: quantity as number, ...notesField });
  }
  return parsed;
}

// Lets any consumer of an OrderItem (order detail, the kitchen queue, the order-item:new /
// order-item:note-updated socket payloads — all built from this same select) tell whether
// its parent deal line was customized, and read the deal's note, without a second query.
const dealOrderLineSelect = { dealName: true, customization: true, notes: true } satisfies Prisma.OrderDealLineSelect;

const orderItemInclude = {
  menuItem: { select: { id: true, name: true } },
  dealOrderLine: { select: dealOrderLineSelect },
} satisfies Prisma.OrderItemInclude;

const orderInclude = {
  items: { include: orderItemInclude },
  dealLines: true,
  diningArea: true,
  // Added for the reception-review flow: the incoming-orders list and the
  // order:submitted socket payload both need the taker's/customer's name without a
  // second query. Purely additive on every other existing consumer of OrderWithItems.
  placedByStaff: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
  customerAddress: { select: { id: true, addressText: true } },
  // Guest orders: the delivery area picked at checkout (its name is also inside deliveryAddress).
  deliveryArea: { select: { id: true, nameEn: true, nameUr: true } },
} satisfies Prisma.OrderInclude;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface CreateOrderItemInput {
  menuItemId: string;
  quantity: number;
  notes?: string;
  // Required iff the menu item has any priced size; must be absent otherwise.
  variantId?: string;
  // Each must be an AddOn scoped to this menu item's category with a price for the
  // chosen variant's size — see resolveAddOns.
  addOnIds?: string[];
  // Required iff the menu item is open-price; must be absent otherwise — see
  // resolveItemPrice, which is what actually enforces both halves of that rule.
  unitPrice?: Prisma.Decimal;
}

// Same shape a normal order line validates to (ParsedItemFields) — no `notes` field, out
// of scope for a customized deal's contents per the plan.
export interface CreateDealCustomizationItemInput {
  menuItemId: string;
  quantity: number;
  variantId?: string;
  addOnIds?: string[];
}

export interface CreateDealCustomizationInput {
  items: CreateDealCustomizationItemInput[];
  finalPrice: Prisma.Decimal;
  reason?: string;
}

export interface CreateOrderDealInput {
  dealId: string;
  quantity: number;
  customization?: CreateDealCustomizationInput;
  // Already trimmed/length-checked by parseLineNote; absent for no note.
  notes?: string;
}

export interface CreateOrderInput {
  source: OrderSource;
  type: OrderType;
  paymentMethod: PaymentMethod;
  // Staff-placed (POS) orders have a placedByStaffId; customer-placed (online) orders don't.
  placedByStaffId?: string;
  diningAreaId?: string;
  waiterId?: string;
  riderId?: string;
  customerId?: string;
  customerAddressId?: string;
  deliveryAddress?: string;
  discount?: Prisma.Decimal;
  notes?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  paymentScreenshotUrl?: string;
  // Duplicate-safe submit — see submitOrderTakerOrder. Unset for every other caller.
  clientRequestId?: string;
  // Set only by the POS route's "Schedule for later" (already validated by
  // parseScheduledFor). Creates the order SCHEDULED: no stock, no kitchen, no emit.
  scheduledFor?: Date;
  // Guest checkout (no Customer row): who and where. Set by POST /api/online/guest-orders only.
  customerName?: string;
  customerPhone?: string;
  deliveryAreaId?: string;
  // Added on top of the priced lines and included in totalAmount; stored on the order so every later
  // recompute keeps it.
  deliveryFee?: Prisma.Decimal;
  // The customer's private status link and the short code read out over the phone.
  publicId?: string;
  publicCode?: string;
  paymentProofMediaId?: string;
  // A keyed hash of the client IP, written to OrderClientIp for the Postgres rate limits.
  clientIpHash?: string;
  // Only things the website offers may be ordered: an item must be available online and sellable
  // alone, a deal must be active, available online and have fixed contents.
  onlineOnly?: boolean;
  // Checked against the server-priced items+deals (before discount and fee).
  minSubtotal?: Prisma.Decimal;
  // Checked against the server-priced total (including the fee).
  maxTotal?: Prisma.Decimal;
  // Runs inside the creation transaction, after the per-business-day advisory lock, so a check
  // here (a rate limit) is atomic with the insert. Throw to refuse the order.
  guard?: (tx: Prisma.TransactionClient) => Promise<void>;
  items: CreateOrderItemInput[];
  deals?: CreateOrderDealInput[];
}

type MenuItemWithVariants = Prisma.MenuItemGetPayload<{ include: { variants: true } }>;

// Shared by createOrder and addOrderItems — the two places a direct (non-deal) order
// line gets priced. A menu item with any priced size (variant) must be ordered via one
// of those variants; a menu item with no priced sizes uses its own MenuItem.price as
// before; an open-price item takes its price from the line itself instead (see
// isOpenPrice's schema comment — mutually exclusive with having a price or variants).
// Either way the resolved price/label are snapshotted onto the OrderItem, never re-read
// live later — changing a size's price (or the item's min/max) afterward never touches
// past orders.
function resolveItemPrice(
  menuItem: MenuItemWithVariants,
  variantId: string | undefined,
  unitPrice: Prisma.Decimal | undefined,
): { unitPrice: Prisma.Decimal; variantId: string | null; variantLabel: string | null; isCustomPrice: boolean } {
  if (menuItem.isOpenPrice) {
    if (variantId !== undefined) {
      throw new InvalidOrderItemsError(`menuItem ${menuItem.id} is open-price and has no sizes`);
    }
    if (unitPrice === undefined) {
      throw new InvalidOrderItemsError(`menuItem ${menuItem.id} is open-price and requires unitPrice`);
    }
    if (menuItem.minPrice !== null && unitPrice.lessThan(menuItem.minPrice)) {
      throw new InvalidOrderItemsError(`menuItem ${menuItem.id}'s unitPrice must be at least ${menuItem.minPrice.toString()}`);
    }
    if (menuItem.maxPrice !== null && unitPrice.greaterThan(menuItem.maxPrice)) {
      throw new InvalidOrderItemsError(`menuItem ${menuItem.id}'s unitPrice must be at most ${menuItem.maxPrice.toString()}`);
    }
    return { unitPrice, variantId: null, variantLabel: null, isCustomPrice: true };
  }

  if (unitPrice !== undefined) {
    throw new InvalidOrderItemsError(`menuItem ${menuItem.id} does not accept a client-sent unitPrice`);
  }

  const pricedVariants = menuItem.variants.filter((variant) => variant.price !== null);

  if (pricedVariants.length > 0) {
    if (variantId === undefined) {
      throw new InvalidOrderItemsError(`menuItem ${menuItem.id} requires choosing a size (variantId)`);
    }
    const variant = pricedVariants.find((candidate) => candidate.id === variantId);
    if (!variant) {
      throw new InvalidOrderItemsError(
        `variantId ${variantId} does not reference a priced size of menuItem ${menuItem.id}`,
      );
    }
    return { unitPrice: variant.price!, variantId: variant.id, variantLabel: variant.label, isCustomPrice: false };
  }

  if (variantId !== undefined) {
    throw new InvalidOrderItemsError(`menuItem ${menuItem.id} has no sizes — variantId must not be provided`);
  }
  if (menuItem.price === null) {
    throw new InvalidOrderItemsError(`menuItem ${menuItem.id} has no standalone price and cannot be ordered directly`);
  }
  return { unitPrice: menuItem.price, variantId: null, variantLabel: null, isCustomPrice: false };
}

// Sibling to resolveItemPrice, used only for an item inside a deal's customized contents
// (zero-priced like every deal-exploded item — the deal's finalPrice is what's charged, not
// a sum of these). Deliberately does NOT require menuItem.price !== null the way
// resolveItemPrice does: a deal legitimately contains deal-only items (sellableAlone:
// false, no standalone price), and the standard composition never sets a size at all, so a
// size is only required when one is actually given, never forced onto an untouched row.
function resolveDealCustomizationVariant(
  menuItem: MenuItemWithVariants,
  variantId: string | undefined,
): { variantId: string | null; variantLabel: string | null } {
  // An open-price item has no fixed price to explode a deal's (always zero-priced)
  // composed items at, and letting the cashier swap one in here would bypass the
  // normal unitPrice-entry flow entirely — keep it out, same as a deal's own saved
  // composition (see deal.controller.ts's validateMenuItemIdsExist).
  if (menuItem.isOpenPrice) {
    throw new InvalidOrderDealsError(`menuItem ${menuItem.id} is open-price and cannot be part of a deal`);
  }
  if (variantId === undefined) {
    return { variantId: null, variantLabel: null };
  }
  const variant = menuItem.variants.find((candidate) => candidate.id === variantId);
  if (!variant) {
    throw new InvalidOrderDealsError(`variantId ${variantId} does not reference a size of menuItem ${menuItem.id}`);
  }
  return { variantId: variant.id, variantLabel: variant.label };
}

type AddOnWithPrices = Prisma.AddOnGetPayload<{ include: { prices: true } }>;

// Add-ons are scoped to one category (see AddOn's schema comment — size labels alone
// collide across categories, e.g. Fries also has a "Large") and priced per size, so a
// chosen add-on must both belong to the menu item's category and have a price for the
// line's resolved variant label. Snapshotted onto the OrderItem like unitPrice/variantLabel
// — a later rename/price change/delete of the AddOn never touches a placed order.
function resolveAddOns(
  menuItem: MenuItemWithVariants,
  variantLabel: string | null,
  addOnIds: string[] | undefined,
  addOnById: Map<string, AddOnWithPrices>,
): { addOns: Prisma.InputJsonValue | typeof Prisma.DbNull; addOnsTotal: Prisma.Decimal } {
  if (addOnIds === undefined || addOnIds.length === 0) {
    return { addOns: Prisma.DbNull, addOnsTotal: new Prisma.Decimal(0) };
  }

  const resolved: { addOnId: string; name: string; price: string }[] = [];
  let addOnsTotal = new Prisma.Decimal(0);
  for (const addOnId of addOnIds) {
    const addOn = addOnById.get(addOnId);
    if (!addOn) {
      throw new InvalidOrderItemsError(`addOnId ${addOnId} does not reference an existing add-on`);
    }
    if (addOn.categoryId === null || addOn.categoryId !== menuItem.categoryId) {
      throw new InvalidOrderItemsError(`addOnId ${addOnId} does not apply to menuItem ${menuItem.id}`);
    }
    const priceRow = variantLabel !== null ? addOn.prices.find((price) => price.size === variantLabel) : undefined;
    if (!priceRow) {
      throw new InvalidOrderItemsError(
        `addOnId ${addOnId} has no price for menuItem ${menuItem.id}'s chosen size`,
      );
    }
    resolved.push({ addOnId, name: addOn.name, price: priceRow.price.toString() });
    addOnsTotal = addOnsTotal.plus(priceRow.price);
  }
  return { addOns: resolved, addOnsTotal };
}

async function loadAddOnById(items: { addOnIds?: string[] }[]): Promise<Map<string, AddOnWithPrices>> {
  const addOnIds = [...new Set(items.flatMap((item) => item.addOnIds ?? []))];
  if (addOnIds.length === 0) {
    return new Map();
  }
  const addOns = await prisma.addOn.findMany({ where: { id: { in: addOnIds } }, include: { prices: true } });
  return new Map(addOns.map((addOn) => [addOn.id, addOn]));
}

// Exploded-item shape is the same whether the deal is standard or customized — only how
// this list gets built differs. unitPrice/subtotal on each row stay 0 either way; all of
// a deal's revenue lives on its OrderDealLine, never summed from these.
interface PendingExplodedItem {
  menuItemId: string;
  kitchenId: string;
  quantity: number;
  variantId: string | null;
  variantLabel: string | null;
  addOns: Prisma.InputJsonValue | typeof Prisma.DbNull;
}

// Shared by createOrder (insert path) and updateSubmission (delete-then-recreate path) —
// resolves every direct item and deal line to its priced/exploded create-data, with zero
// knowledge of what happens to that data afterward (no transaction, no order id yet).
// Pulled out of createOrder as-is so "submit" and "re-price on submission edit" go through
// the exact same pricing/validation path a normal order does.
async function buildOrderLines(
  items: CreateOrderItemInput[],
  deals: CreateOrderDealInput[],
  options: { onlineOnly?: boolean } = {},
) {
  // A deal's composition (DealItem rows) is loaded up front so exploding each ordered
  // deal into OrderItem rows needs no further queries inside the transaction.
  const requestedDeals = deals;
  const customizationItems = requestedDeals.flatMap((deal) => deal.customization?.items ?? []);

  const menuItemIds = [
    ...new Set([...items.map((item) => item.menuItemId), ...customizationItems.map((item) => item.menuItemId)]),
  ];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { variants: true },
  });
  const menuItemById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]));

  for (const menuItemId of menuItemIds) {
    if (!menuItemById.has(menuItemId)) {
      throw new MenuItemNotFoundError(menuItemId);
    }
  }

  if (options.onlineOnly) {
    // Direct lines only: a customized deal's contents are staff-only and never reach this path.
    for (const item of items) {
      const menuItem = menuItemById.get(item.menuItemId)!;
      if (!menuItem.isAvailableOnline || !menuItem.sellableAlone || menuItem.isOpenPrice) {
        throw new ItemNotOrderableOnlineError(`menuItem ${menuItem.id} is not available to order online`);
      }
    }
  }

  const addOnById = await loadAddOnById([...items, ...customizationItems]);

  const orderItemsCreateData = items.map((item) => {
    // Non-null: existence of every menuItemId was just verified above.
    const menuItem = menuItemById.get(item.menuItemId)!;
    const {
      unitPrice: basePrice,
      variantId,
      variantLabel,
      isCustomPrice,
    } = resolveItemPrice(menuItem, item.variantId, item.unitPrice);
    const { addOns, addOnsTotal } = resolveAddOns(menuItem, variantLabel, item.addOnIds, addOnById);
    // unitPrice includes add-ons — the base item/variant price plus every chosen add-on's
    // price, summed once here and snapshotted; nothing re-derives it later. An open-price
    // item never has add-ons (resolveAddOns rejects any addOnIds when variantLabel is
    // null), so addOnsTotal is always 0 for one — basePrice (the typed price) stands alone.
    const unitPrice = basePrice.plus(addOnsTotal);
    return {
      menuItemId: item.menuItemId,
      kitchenId: menuItem.kitchenId,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice.times(item.quantity),
      variantId,
      variantLabel,
      addOns,
      isCustomPrice,
      ...(item.notes !== undefined ? { notes: item.notes } : {}),
    };
  });

  const dealIds = [...new Set(requestedDeals.map((deal) => deal.dealId))];
  const dealRows =
    dealIds.length > 0
      ? await prisma.deal.findMany({
          where: { id: { in: dealIds } },
          include: { items: { include: { menuItem: { select: { id: true, kitchenId: true } } } } },
        })
      : [];
  const dealById = new Map(dealRows.map((deal) => [deal.id, deal]));

  for (const dealId of dealIds) {
    if (!dealById.has(dealId)) {
      throw new DealNotFoundError(dealId);
    }
  }
  if (options.onlineOnly) {
    for (const deal of dealRows) {
      if (!deal.isActive || !deal.isAvailableOnline || deal.items.length === 0) {
        throw new ItemNotOrderableOnlineError(`deal ${deal.id} is not available to order online`);
      }
    }
  }

  const pendingDealLines = requestedDeals.map((requested) => {
    // Non-null: existence of every dealId was just verified above.
    const deal = dealById.get(requested.dealId)!;

    if (requested.customization === undefined) {
      const explodedItems: PendingExplodedItem[] = deal.items.map((dealItem) => ({
        menuItemId: dealItem.menuItemId,
        kitchenId: dealItem.menuItem.kitchenId,
        quantity: dealItem.quantity * requested.quantity,
        variantId: null,
        variantLabel: null,
        addOns: Prisma.DbNull,
      }));
      return {
        dealId: deal.id,
        dealName: deal.name,
        quantity: requested.quantity,
        unitPrice: deal.price,
        subtotal: deal.price.times(requested.quantity),
        baseUnitPrice: deal.price,
        customization: Prisma.DbNull as Prisma.InputJsonValue | typeof Prisma.DbNull,
        notes: requested.notes ?? null,
        explodedItems,
      };
    }

    const { customization } = requested;
    const snapshotItems: {
      menuItemId: string;
      name: string;
      variantLabel?: string;
      quantity: number;
      addOns: { name: string; price: string }[];
    }[] = [];
    const explodedItems: PendingExplodedItem[] = customization.items.map((item) => {
      // Non-null: existence of every menuItemId (including customization items) was
      // verified above, alongside the normal items.
      const menuItem = menuItemById.get(item.menuItemId)!;
      const { variantId, variantLabel } = resolveDealCustomizationVariant(menuItem, item.variantId);
      const { addOns, addOnsTotal } = resolveAddOns(menuItem, variantLabel, item.addOnIds, addOnById);
      void addOnsTotal; // zero-priced like any deal-exploded item — the deal's finalPrice is what's charged.
      snapshotItems.push({
        menuItemId: item.menuItemId,
        name: menuItem.name,
        ...(variantLabel !== null ? { variantLabel } : {}),
        quantity: item.quantity,
        // The readable snapshot drops addOnId (unlike the OrderItem.addOns write below,
        // which keeps the normal {addOnId, name, price} shape) — it's for a human to read
        // order history, not to be machine-resolved back into a real AddOn.
        addOns:
          addOns === Prisma.DbNull
            ? []
            : (addOns as { addOnId: string; name: string; price: string }[]).map(({ name, price }) => ({
                name,
                price,
              })),
      });
      return {
        menuItemId: item.menuItemId,
        kitchenId: menuItem.kitchenId,
        quantity: item.quantity,
        variantId,
        variantLabel,
        addOns,
      };
    });

    return {
      dealId: deal.id,
      dealName: deal.name,
      quantity: requested.quantity,
      unitPrice: customization.finalPrice,
      subtotal: customization.finalPrice,
      baseUnitPrice: deal.price,
      customization: {
        ...(customization.reason !== undefined ? { reason: customization.reason } : {}),
        items: snapshotItems,
      } as Prisma.InputJsonValue,
      notes: requested.notes ?? null,
      explodedItems,
    };
  });

  return { orderItemsCreateData, pendingDealLines };
}

export async function createOrder(input: CreateOrderInput): Promise<OrderWithItems> {
  if (input.items.length === 0 && (input.deals ?? []).length === 0) {
    throw new EmptyOrderError();
  }

  const activeBusinessDay = await prisma.businessDay.findFirst({ where: { isActive: true } });
  if (!activeBusinessDay) {
    throw new NoActiveBusinessDayError();
  }

  if (input.waiterId !== undefined) {
    await requireActiveEmployee(input.waiterId);
  }
  if (input.riderId !== undefined) {
    await requireActiveEmployee(input.riderId);
  }

  const { orderItemsCreateData, pendingDealLines } = await buildOrderLines(input.items, input.deals ?? [], {
    ...(input.onlineOnly ? { onlineOnly: true } : {}),
  });

  const discount = input.discount ?? new Prisma.Decimal(0);
  const deliveryFee = input.deliveryFee ?? new Prisma.Decimal(0);
  const itemsTotal = orderItemsCreateData.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
  const dealLinesTotal = pendingDealLines.reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0));
  const totalAmount = computeOrderTotal({ itemsTotal, dealLinesTotal, discount, deliveryFee });

  // Policy checks on the SERVER-priced amounts (the one place pricing happens).
  if (input.minSubtotal !== undefined && itemsTotal.plus(dealLinesTotal).lessThan(input.minSubtotal)) {
    throw new BelowMinimumError(input.minSubtotal);
  }
  if (input.maxTotal !== undefined && totalAmount.greaterThan(input.maxTotal)) {
    throw new OrderTooLargeError();
  }

  const businessDayId = activeBusinessDay.id;
  const isAwaitingReception = input.status === OrderStatus.AWAITING_RECEPTION;
  const isScheduled = input.scheduledFor !== undefined;

  const order = await prisma.$transaction(async (tx) => {
    // Advisory lock scoped to this business day serializes orderNumber assignment
    // across concurrent requests, closing the race that a plain MAX()+1 read would allow.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${businessDayId})::bigint)`;

    // After the lock, so a check here (the guest-order rate limits) is exact: two concurrent
    // orders can't both pass a limit that only one of them fits under.
    if (input.guard) {
      await input.guard(tx);
    }

    const maxAgg = await tx.order.aggregate({
      where: { businessDayId },
      _max: { orderNumber: true },
    });
    const orderNumber = (maxAgg._max.orderNumber ?? 0) + 1;

    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        businessDayId,
        source: input.source,
        type: input.type,
        paymentMethod: input.paymentMethod,
        totalAmount,
        discount,
        ...(input.placedByStaffId !== undefined ? { placedByStaffId: input.placedByStaffId } : {}),
        ...(input.diningAreaId !== undefined ? { diningAreaId: input.diningAreaId } : {}),
        ...(input.waiterId !== undefined ? { waiterId: input.waiterId } : {}),
        ...(input.riderId !== undefined ? { riderId: input.riderId } : {}),
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.customerAddressId !== undefined ? { customerAddressId: input.customerAddressId } : {}),
        ...(input.deliveryAddress !== undefined ? { deliveryAddress: input.deliveryAddress } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.paymentStatus !== undefined ? { paymentStatus: input.paymentStatus } : {}),
        ...(input.paymentScreenshotUrl !== undefined ? { paymentScreenshotUrl: input.paymentScreenshotUrl } : {}),
        ...(input.paymentProofMediaId !== undefined ? { paymentProofMediaId: input.paymentProofMediaId } : {}),
        ...(input.customerName !== undefined ? { customerName: input.customerName } : {}),
        ...(input.customerPhone !== undefined ? { customerPhone: input.customerPhone } : {}),
        ...(input.deliveryAreaId !== undefined ? { deliveryAreaId: input.deliveryAreaId } : {}),
        deliveryFee,
        ...(input.publicId !== undefined ? { publicId: input.publicId } : {}),
        ...(input.publicCode !== undefined ? { publicCode: input.publicCode } : {}),
        ...(input.clientIpHash !== undefined ? { clientIp: { create: { ipHash: input.clientIpHash } } } : {}),
        ...(input.clientRequestId !== undefined ? { clientRequestId: input.clientRequestId } : {}),
        ...(isScheduled ? { status: OrderStatus.SCHEDULED, scheduledFor: input.scheduledFor } : {}),
        items: { create: orderItemsCreateData },
      },
      include: orderInclude,
    });

    // OrderDealLine.orderId is a required FK, so each line is created after (and
    // pointed at) the order above; its own id is then needed to link the exploded
    // OrderItem rows below, so nested creation inside order.create isn't an option —
    // a single nested write can't have one child reference another child's future id.
    const explodedItemsForDeduction: inventoryService.OrderItemForDeduction[] = [];

    for (const line of pendingDealLines) {
      const dealOrderLine = await tx.orderDealLine.create({
        data: {
          orderId: createdOrder.id,
          dealId: line.dealId,
          dealName: line.dealName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          baseUnitPrice: line.baseUnitPrice,
          customization: line.customization,
          notes: line.notes,
        },
      });

      const explodedItemsData = line.explodedItems.map((item) => ({
        orderId: createdOrder.id,
        menuItemId: item.menuItemId,
        kitchenId: item.kitchenId,
        quantity: item.quantity,
        unitPrice: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(0),
        dealOrderLineId: dealOrderLine.id,
        variantId: item.variantId,
        variantLabel: item.variantLabel,
        addOns: item.addOns,
      }));

      await tx.orderItem.createMany({ data: explodedItemsData });

      for (const item of explodedItemsData) {
        explodedItemsForDeduction.push({ menuItemId: item.menuItemId, quantity: item.quantity });
      }
    }

    // Only staff-placed orders have someone to attribute the deduction to —
    // InventoryTransaction.performedById is a required FK, so there's no valid
    // value to write for a customer-placed online order. Skip the hook in that case.
    // Also skip while AWAITING_RECEPTION regardless of who placed it — nothing is "real"
    // (stock-wise) until reception accepts; acceptOrder deducts at that point instead.
    // Same for SCHEDULED: on hold, so nothing is deducted until it's released and accepted.
    if (input.placedByStaffId !== undefined && !isAwaitingReception && !isScheduled) {
      await inventoryService.deductForOrderItems(tx, {
        orderId: createdOrder.id,
        performedById: input.placedByStaffId,
        items: [
          ...input.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
          ...explodedItemsForDeduction,
        ],
      });
    }

    if (discount.greaterThan(0) && input.placedByStaffId !== undefined) {
      await recordOrderEvent(tx, {
        orderId: createdOrder.id,
        actorId: input.placedByStaffId,
        type: OrderEventType.DISCOUNT_SET,
        before: { discount: money(new Prisma.Decimal(0)), totalAmount: money(totalAmount.plus(discount)) },
        after: { discount: money(discount), totalAmount: money(totalAmount) },
      });
    }

    // Re-fetch when deal lines were created so the returned order.items includes the
    // exploded rows too — the initial create's `include` only captured the plain items.
    return pendingDealLines.length > 0
      ? await tx.order.findUniqueOrThrow({ where: { id: createdOrder.id }, include: orderInclude })
      : createdOrder;
  });

  if (isAwaitingReception) {
    emitSafely(() => getIO().to("pos-admin").emit("order:submitted", buildSubmittedPayload(order)));
  } else if (!isScheduled) {
    emitNewOrderItemsByKitchen(order);
  }
  // A SCHEDULED order emits nothing at all here — releaseScheduledOrder does, once, later.

  return order;
}

// A standalone script (see backend/scripts/dev-fake-online-order.ts) can call createOrder
// without Socket.io ever having been initialized in that process — getIO() would throw.
// Reception-flow emits are non-essential to the write itself (sockets are a live-update
// convenience; the order is already committed), so they're wrapped here rather than
// letting a missing socket server fail an otherwise-successful order placement.
function emitSafely(emit: () => void): void {
  try {
    emit();
  } catch {
    // No Socket.io in this process (e.g. a standalone script) — nothing to notify.
  }
}

function buildSubmittedPayload(order: OrderWithItems) {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    source: order.source,
    diningArea: order.diningArea ? { name: order.diningArea.name } : null,
    takerName: order.placedByStaff?.name ?? null,
    // Guest orders: who it's from and the code to find it by.
    customerName: order.customerName ?? order.customer?.name ?? null,
    publicCode: order.publicCode,
    // TAKEAWAY + ONLINE means a pickup order (no address).
    orderType: order.type,
    itemCount: order.items.length,
    createdAt: order.createdAt,
    // Set only for a released scheduled order.
    scheduledFor: order.scheduledFor,
  };
}

// One emit per kitchen the given items touch, each carrying only that kitchen's items plus
// the order-level fields — shared by "order-item:new" (items just placed/added) and
// "order-item:note-updated" (a note changed on items the kitchen already has), so a kitchen
// learns about both the same way, in the same payload shape.
function emitOrderItemsByKitchen(
  event: "order-item:new" | "order-item:note-updated",
  order: OrderWithItems,
  items: OrderWithItems["items"],
): void {
  const io = getIO();
  const itemsByKitchen = new Map<string, OrderWithItems["items"]>();

  for (const item of items) {
    const bucket = itemsByKitchen.get(item.kitchenId);
    if (bucket) {
      bucket.push(item);
    } else {
      itemsByKitchen.set(item.kitchenId, [item]);
    }
  }

  for (const [kitchenId, kitchenItems] of itemsByKitchen) {
    io.to(`kitchen:${kitchenId}`).emit(event, {
      orderId: order.id,
      orderNumber: order.orderNumber,
      type: order.type,
      diningArea: order.diningArea,
      items: kitchenItems,
    });
  }
}

function emitNewOrderItemsByKitchen(order: OrderWithItems): void {
  emitOrderItemsByKitchen("order-item:new", order, order.items);
}

export interface ListOrdersFilter {
  businessDayId?: string;
  status?: OrderStatus;
  source?: OrderSource;
  diningAreaId?: string;
  // Set only for an ORDER_TAKER caller — scopes the list to orders they placed. Every
  // other caller omits this and sees the normal unscoped list.
  placedByStaffId?: string;
}

export function listOrders(filter: ListOrdersFilter) {
  return prisma.order.findMany({
    where: {
      ...(filter.businessDayId !== undefined ? { businessDayId: filter.businessDayId } : {}),
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.source !== undefined ? { source: filter.source } : {}),
      ...(filter.diningAreaId !== undefined ? { diningAreaId: filter.diningAreaId } : {}),
      ...(filter.placedByStaffId !== undefined ? { placedByStaffId: filter.placedByStaffId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

// `ownerStaffId` is set only for an ORDER_TAKER caller — returns null (the controller maps
// this to 404, never 403, so a taker can't tell the difference between "doesn't exist" and
// "not yours") when the order exists but was placed by someone else.
export function getOrderById(id: string, ownerStaffId?: string) {
  return prisma.order.findFirst({
    where: { id, ...(ownerStaffId !== undefined ? { placedByStaffId: ownerStaffId } : {}) },
    include: orderInclude,
  });
}

// There's no derived/aggregate Order.status today (confirmed: it's only ever a raw
// written literal — see docs/AS_BUILT_BACKEND.md), so an ORDER_TAKER's order:status only
// ever fires for the transitions that actually exist: accepted, rejected, cancelled.
// IN_KITCHEN/READY/COMPLETED are never set anywhere and so never emit one.
function emitOrderStatusToTaker(order: Pick<OrderWithItems, "id" | "orderNumber" | "source" | "status" | "placedByStaffId">): void {
  if (order.source !== OrderSource.ORDER_TAKER || order.placedByStaffId === null) {
    return;
  }
  emitSafely(() =>
    getIO()
      .to(`user:${order.placedByStaffId}`)
      .emit("order:status", { orderId: order.id, orderNumber: order.orderNumber, status: order.status }),
  );
}

// ================= Cancellation =================

// The only statuses an order can be cancelled from (cancelOrder). COMPLETED and CANCELLED are done;
// SCHEDULED is cancelled through cancelScheduledOrder; IN_KITCHEN/READY are never set today.
export const CANCELLABLE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.AWAITING_RECEPTION,
];

// Only these roles may cancel an order that has been paid — the money has to be handed back.
const PAID_CANCEL_ROLES: readonly StaffRole[] = [StaffRole.SUPER_ADMIN, StaffRole.POS_ADMIN];

export class OrderNotCancellableError extends Error {
  constructor(public readonly status: OrderStatus) {
    super(notCancellableMessage(status));
  }
}

function notCancellableMessage(status: OrderStatus): string {
  switch (status) {
    case OrderStatus.COMPLETED:
      return "Completed orders can't be cancelled";
    case OrderStatus.CANCELLED:
      return "This order is already cancelled";
    case OrderStatus.SCHEDULED:
      return "Scheduled orders are cancelled from Scheduled orders, not here";
    case OrderStatus.IN_KITCHEN:
    case OrderStatus.READY:
      return `This order is ${status} and can't be cancelled`;
    default:
      // Read as cancellable a moment ago, but its status changed before the cancel landed.
      return "This order just changed — reload it and try again";
  }
}

export class PaidOrderCancelForbiddenError extends Error {}

export interface CancelOrderInput {
  reason: string;
  actorId: string;
  actorRole: StaffRole;
}

type CancellableOrder = Prisma.OrderGetPayload<{ include: { items: { select: { id: true; kitchenId: true } } } }>;

function assertCancellable(order: CancellableOrder, actorRole: StaffRole): void {
  if (!CANCELLABLE_STATUSES.includes(order.status)) {
    throw new OrderNotCancellableError(order.status);
  }
  if (isPaid(order) && !PAID_CANCEL_ROLES.includes(actorRole)) {
    throw new PaidOrderCancelForbiddenError();
  }
}

// The one cancel write, shared by every path that cancels a live order. Conditional on the status
// read before, so a concurrent accept/deliver/cancel can't be overwritten — and that UPDATE row-locks
// the order, so the stock return below can only ever happen once. Returns stock the order still has
// deducted (see restockForCancelledOrder) and records the CANCELLED event, all in `tx`.
async function cancelInTransaction(
  tx: Prisma.TransactionClient,
  existing: CancellableOrder,
  input: { reason: string; actorId: string },
): Promise<OrderWithItems> {
  const result = await tx.order.updateMany({
    where: { id: existing.id, status: existing.status },
    data: {
      status: OrderStatus.CANCELLED,
      cancelledReason: input.reason,
      cancelledAt: new Date(),
      cancelledById: input.actorId,
    },
  });
  if (result.count === 0) {
    const now = await tx.order.findUnique({ where: { id: existing.id }, select: { status: true } });
    throw new OrderNotCancellableError(now?.status ?? existing.status);
  }

  const { restocked } = await inventoryService.restockForCancelledOrder(tx, {
    orderId: existing.id,
    performedById: input.actorId,
  });
  await recordOrderEvent(tx, {
    orderId: existing.id,
    actorId: input.actorId,
    type: OrderEventType.CANCELLED,
    reason: input.reason,
    before: cancelSnapshot(existing),
    after: { status: OrderStatus.CANCELLED, restocked },
  });
  return tx.order.findUniqueOrThrow({ where: { id: existing.id }, include: orderInclude });
}

// Kitchens take the cancelled order's items off their display: one "order:cancelled" per kitchen
// room with that kitchen's item ids, and one to pos-admin with all of them. Only for an order that
// had reached the kitchens (an order still at reception never did).
function emitOrderCancelled(
  order: { id: string; orderNumber: number },
  items: { id: string; kitchenId: string }[],
  reachedKitchens: boolean,
): void {
  emitItemsGone("order:cancelled", order, items, reachedKitchens);
}

function emitItemsGone(
  event: "order:cancelled" | "order-item:removed",
  order: { id: string; orderNumber: number },
  items: { id: string; kitchenId: string }[],
  reachedKitchens: boolean,
): void {
  emitSafely(() => {
    const io = getIO();
    if (reachedKitchens) {
      const idsByKitchen = new Map<string, string[]>();
      for (const item of items) {
        idsByKitchen.set(item.kitchenId, [...(idsByKitchen.get(item.kitchenId) ?? []), item.id]);
      }
      for (const [kitchenId, itemIds] of idsByKitchen) {
        io.to(`kitchen:${kitchenId}`).emit(event, { orderId: order.id, orderNumber: order.orderNumber, itemIds });
      }
    }
    io.to("pos-admin").emit(event, { orderId: order.id, orderNumber: order.orderNumber, itemIds: items.map((item) => item.id) });
  });
}

// Staff cancel (POS_ADMIN/SUPER_ADMIN, with a reason). Allowed from CANCELLABLE_STATUSES only; a
// paid order only by PAID_CANCEL_ROLES. Stock the order deducted is returned, its kitchens are told.
export async function cancelOrder(id: string, input: CancelOrderInput): Promise<OrderWithItems> {
  const existing = await prisma.order.findUnique({ where: { id }, include: { items: { select: { id: true, kitchenId: true } } } });
  if (!existing) {
    throw new OrderNotFoundError();
  }
  assertCancellable(existing, input.actorRole);

  const order = await prisma.$transaction((tx) => cancelInTransaction(tx, existing, input));

  emitOrderCancelled(order, existing.items, existing.status !== OrderStatus.AWAITING_RECEPTION);
  emitOrderStatusToTaker(order);
  return order;
}

// What a CANCELLED event records about the order just before it was cancelled. `paid` is what
// reports read as "cancelled after payment".
function cancelSnapshot(order: { status: OrderStatus; paymentStatus: PaymentStatus; totalAmount: Prisma.Decimal }) {
  return {
    status: order.status,
    paymentStatus: order.paymentStatus,
    paid: order.paymentStatus === PaymentStatus.VERIFIED,
    totalAmount: money(order.totalAmount),
  };
}

// Used only by an ORDER_TAKER cancelling their own order — must still be AWAITING_RECEPTION
// (once accepted, cancelling goes through the normal cancelOrder path above, POS_ADMIN/
// SUPER_ADMIN only) and must belong to the caller. Nothing to restock: an AWAITING_RECEPTION
// order never deducted inventory in the first place.
export async function cancelOwnAwaitingOrder(id: string, staffId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findFirst({
    where: { id, placedByStaffId: staffId },
    include: { items: { select: { id: true, kitchenId: true } } },
  });
  if (!order) {
    throw new OrderNotFoundError();
  }
  if (order.status !== OrderStatus.AWAITING_RECEPTION) {
    throw new OrderNotAwaitingReceptionError();
  }
  // Reception may have taken payment on it already — then only they can cancel it.
  assertCancellable(order, StaffRole.ORDER_TAKER);
  const updated = await prisma.$transaction((tx) =>
    cancelInTransaction(tx, order, { reason: "Cancelled by the order taker", actorId: staffId }),
  );
  emitSafely(() => getIO().to("pos-admin").emit("order:updated", { orderId: updated.id, orderNumber: updated.orderNumber }));
  emitOrderStatusToTaker(updated);
  return updated;
}

type OrderChangeSnapshot = {
  orderUpdatedAt: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: string;
};

export type OrderChangeRequestInput = {
  orderId: string;
  requestedById: string;
  kind: OrderChangeKind;
  requestedState?: Prisma.JsonObject;
  reason?: string;
};

function jsonDecimal(value: unknown): Prisma.Decimal | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  try {
    return new Prisma.Decimal(value);
  } catch {
    return undefined;
  }
}

function snapshotOrder(order: { updatedAt: Date; status: OrderStatus; paymentStatus: PaymentStatus; totalAmount: Prisma.Decimal }): OrderChangeSnapshot {
  return {
    orderUpdatedAt: order.updatedAt.toISOString(),
    status: order.status,
    paymentStatus: order.paymentStatus,
    totalAmount: order.totalAmount.toString(),
  };
}

export async function createOrderChange(input: OrderChangeRequestInput) {
  const order = await prisma.order.findFirst({ where: { id: input.orderId, placedByStaffId: input.requestedById } });
  if (!order) throw new OrderNotFoundError();
  if (order.status === OrderStatus.AWAITING_RECEPTION) throw new OrderAwaitingReceptionError();
  const change = await prisma.orderChange.create({
    data: {
      orderId: order.id,
      requestedById: input.requestedById,
      kind: input.kind,
      status: OrderChangeStatus.PENDING,
      previousState: snapshotOrder(order),
      ...(input.requestedState !== undefined ? { requestedState: input.requestedState } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
    include: { order: true, requestedBy: { select: { id: true, name: true } } },
  });
  emitSafely(() => getIO().to("pos-admin").emit("order:change-requested", {
    changeId: change.id, orderId: order.id, orderNumber: order.orderNumber, kind: change.kind,
  }));
  return change;
}

export function listOrderChanges(orderId: string, requestedById?: string) {
  return prisma.orderChange.findMany({
    where: { orderId, ...(requestedById !== undefined ? { requestedById } : {}) },
    include: {
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      order: { select: { id: true, orderNumber: true, status: true, updatedAt: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export function listPendingOrderChanges() {
  return prisma.orderChange.findMany({
    where: { status: OrderChangeStatus.PENDING },
    include: { requestedBy: { select: { id: true, name: true } }, order: { include: orderInclude } },
    orderBy: { createdAt: "asc" },
  });
}

export async function reviewOrderChange(changeId: string, reviewerId: string, approved: boolean, rejectionReason?: string) {
  const change = await prisma.orderChange.findUnique({ where: { id: changeId } });
  if (!change) throw new OrderChangeNotFoundError();
  if (change.status !== OrderChangeStatus.PENDING) throw new OrderChangeAlreadyReviewedError();
  const order = await prisma.order.findUnique({ where: { id: change.orderId }, include: { items: true } });
  if (!order) throw new OrderNotFoundError();
  // The review route is reception-only (POS_ADMIN/SUPER_ADMIN), so a paid order may be cancelled here.
  if (approved && change.kind === OrderChangeKind.CANCEL) assertCancellable(order, StaffRole.POS_ADMIN);
  const snapshot = change.previousState as unknown as OrderChangeSnapshot;
  if (order.updatedAt.toISOString() !== snapshot.orderUpdatedAt) throw new OrderChangeStaleError();
  if (!approved) {
    return prisma.orderChange.update({
      where: { id: changeId },
      data: {
        status: OrderChangeStatus.REJECTED,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
        ...(rejectionReason !== undefined ? { rejectionReason } : {}),
      },
    });
  }
  if (change.kind === OrderChangeKind.CANCEL) {
    const reviewed = await prisma.$transaction(async (tx) => {
      await cancelInTransaction(tx, order, {
        reason: change.reason ? `Cancellation approved by reception: ${change.reason}` : "Cancellation approved by reception",
        actorId: reviewerId,
      });
      return tx.orderChange.update({
        where: { id: changeId },
        data: { status: OrderChangeStatus.APPROVED, reviewedById: reviewerId, reviewedAt: new Date() },
      });
    });
    emitOrderCancelled(order, order.items, true);
    emitOrderStatusToTaker({ ...order, status: OrderStatus.CANCELLED });
    emitSafely(() => getIO().to(`user:${change.requestedById}`).emit("order:change-reviewed", {
      changeId: reviewed.id, orderId: order.id, status: reviewed.status,
    }));
    return reviewed;
  } else {
    const requested = change.requestedState;
    if (!requested || typeof requested !== "object") {
      throw new InvalidOrderItemsError("Approved edit request is invalid");
    }
    const payload = requested as Record<string, unknown>;
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const rawDeals = Array.isArray(payload.deals) ? payload.deals : [];
    const items = parseOrderItems(rawItems, { allowUnitPrice: false });
    const deals = parseOrderDeals(rawDeals, { allowCustomization: true }).map((deal) => ({
      ...deal,
      ...(deal.customization
        ? {
            customization: {
              ...deal.customization,
              finalPrice: jsonDecimal(deal.customization.finalPrice) ?? deal.customization.finalPrice,
            },
          }
        : {}),
    }));
    if (items.length === 0 && deals.length === 0) throw new EmptyOrderError();
    const { orderItemsCreateData, pendingDealLines } = await buildOrderLines(items, deals);
    const discount = order.discount;
    const totalAmount = computeOrderTotal({
      itemsTotal: orderItemsCreateData.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0)),
      dealLinesTotal: pendingDealLines.reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0)),
      discount,
      deliveryFee: order.deliveryFee,
    });
    if (totalAmount.isNegative()) throw new DiscountExceedsTotalError();
    const reviewed = await prisma.$transaction(async (tx) => {
      await inventoryService.restockForOrderItems(tx, {
        orderId: order.id,
        performedById: reviewerId,
        items: order.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
      });
      await tx.orderItem.deleteMany({ where: { orderId: order.id } });
      await tx.orderDealLine.deleteMany({ where: { orderId: order.id } });
      await tx.order.update({
        where: { id: order.id },
        data: {
          totalAmount,
          ...(typeof payload.notes === "string" ? { notes: payload.notes } : {}),
          items: { create: orderItemsCreateData },
        },
      });
      for (const line of pendingDealLines) {
        const dealLine = await tx.orderDealLine.create({
          data: {
            orderId: order.id,
            dealId: line.dealId,
            dealName: line.dealName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            subtotal: line.subtotal,
            baseUnitPrice: line.baseUnitPrice,
            customization: line.customization,
            notes: line.notes,
          },
        });
        await tx.orderItem.createMany({
          data: line.explodedItems.map((item) => ({
            orderId: order.id,
            menuItemId: item.menuItemId,
            kitchenId: item.kitchenId,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(0),
            subtotal: new Prisma.Decimal(0),
            dealOrderLineId: dealLine.id,
            variantId: item.variantId,
            variantLabel: item.variantLabel,
            addOns: item.addOns,
          })),
        });
      }
      const allItems = [...orderItemsCreateData, ...pendingDealLines.flatMap((line) => line.explodedItems)];
      await inventoryService.deductForOrderItems(tx, {
        orderId: order.id,
        performedById: reviewerId,
        items: allItems.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
      });
      return tx.orderChange.update({
        where: { id: changeId },
        data: { status: OrderChangeStatus.APPROVED, reviewedById: reviewerId, reviewedAt: new Date() },
      });
    });
    emitSafely(() => getIO().to("pos-admin").emit("order:updated", { orderId: order.id, orderNumber: order.orderNumber }));
    emitSafely(() => getIO().to(`user:${change.requestedById}`).emit("order:change-reviewed", {
      changeId: reviewed.id, orderId: order.id, status: reviewed.status,
    }));
    return reviewed;
  }
}

export interface AssignOrderInput {
  waiterId?: string;
  riderId?: string;
  diningAreaId?: string;
}

export async function assignOrder(id: string, input: AssignOrderInput): Promise<OrderWithItems> {
  if (input.waiterId !== undefined) {
    await requireActiveEmployee(input.waiterId);
  }
  if (input.riderId !== undefined) {
    await requireActiveEmployee(input.riderId);
  }

  return prisma.order.update({
    where: { id },
    data: {
      ...(input.waiterId !== undefined ? { waiterId: input.waiterId } : {}),
      ...(input.riderId !== undefined ? { riderId: input.riderId } : {}),
      ...(input.diningAreaId !== undefined ? { diningAreaId: input.diningAreaId } : {}),
    },
    include: orderInclude,
  });
}

// ================= Reception review (AWAITING_RECEPTION) =================

// Computes a customized deal's price the same way the POS cashier's DealCustomizeDialog
// does (standard + extras) but server-side, since an ORDER_TAKER must never set their own
// price. Judgment call: without the frontend's per-row "origin" (standard/swapped/added)
// bookkeeping — which never reaches the server — this can't tell a swap from an add, so it
// treats any quantity of a menuItemId beyond the deal's own standard count as "added" and
// charges its regular price for that excess. That's a simplification versus the POS
// dialog's richer rule (a swap alone never adds anything), but it errs toward not
// undercharging, and there's no ORDER_TAKER-facing UI yet that would expose the difference.
export async function computeServerDealPrice(
  dealId: string,
  customizationItems: CreateDealCustomizationItemInput[],
): Promise<Prisma.Decimal> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { items: true } });
  if (!deal) {
    throw new DealNotFoundError(dealId);
  }

  const menuItemIds = [...new Set(customizationItems.map((item) => item.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({ where: { id: { in: menuItemIds } }, include: { variants: true } });
  const menuItemById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]));
  const addOnById = await loadAddOnById(customizationItems);

  const standardQtyByMenuItemId = new Map<string, number>();
  for (const item of deal.items) {
    standardQtyByMenuItemId.set(item.menuItemId, (standardQtyByMenuItemId.get(item.menuItemId) ?? 0) + item.quantity);
  }

  let extras = new Prisma.Decimal(0);
  for (const item of customizationItems) {
    const menuItem = menuItemById.get(item.menuItemId);
    if (!menuItem) {
      throw new MenuItemNotFoundError(item.menuItemId);
    }
    const { variantId, variantLabel } = resolveDealCustomizationVariant(menuItem, item.variantId);
    const { addOnsTotal } = resolveAddOns(menuItem, variantLabel, item.addOnIds, addOnById);
    extras = extras.plus(addOnsTotal.times(item.quantity));

    const standardQty = standardQtyByMenuItemId.get(item.menuItemId) ?? 0;
    const extraQty = item.quantity - standardQty;
    if (extraQty > 0) {
      try {
        const { unitPrice } = resolveItemPrice(menuItem, variantId ?? undefined, undefined);
        extras = extras.plus(unitPrice.times(extraQty));
      } catch {
        // A deal-only item (no standalone price) has nothing to charge for the excess.
      }
    }
  }

  return deal.price.plus(extras);
}

export interface SubmitOrderTakerOrderInput {
  placedByStaffId: string;
  diningAreaId: string;
  items: CreateOrderItemInput[];
  deals?: CreateOrderDealInput[];
  notes?: string;
  clientRequestId: string;
}

// Duplicate-safe: a repeated clientRequestId from the same taker returns the order already
// created for it (isNew: false) instead of creating a second one — the controller uses
// isNew to choose 200 vs 201. A clientRequestId already used by a different taker is a
// conflict, never silently handed back.
export async function submitOrderTakerOrder(
  input: SubmitOrderTakerOrderInput,
): Promise<{ order: OrderWithItems; isNew: boolean }> {
  const existing = await prisma.order.findUnique({ where: { clientRequestId: input.clientRequestId }, include: orderInclude });
  if (existing) {
    if (existing.placedByStaffId !== input.placedByStaffId) {
      throw new ClientRequestIdConflictError();
    }
    return { order: existing, isNew: false };
  }

  const deals = await Promise.all(
    (input.deals ?? []).map(async (deal) => {
      if (!deal.customization) {
        return deal;
      }
      const finalPrice = await computeServerDealPrice(deal.dealId, deal.customization.items);
      return { ...deal, customization: { ...deal.customization, finalPrice } };
    }),
  );

  try {
    const order = await createOrder({
      source: OrderSource.ORDER_TAKER,
      type: OrderType.DINE_IN,
      paymentMethod: PaymentMethod.CASH,
      status: OrderStatus.AWAITING_RECEPTION,
      placedByStaffId: input.placedByStaffId,
      diningAreaId: input.diningAreaId,
      clientRequestId: input.clientRequestId,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      items: input.items,
      deals,
    });
    return { order, isNew: true };
  } catch (error) {
    // True race: two concurrent submits with the same clientRequestId both passed the
    // findUnique check above before either committed. The DB's unique constraint is the
    // backstop — treat it exactly like the pre-check's "existing" branch, not a raw 500.
    const isClientRequestIdCollision =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      JSON.stringify(error.meta?.target ?? "").includes("clientRequestId");
    if (isClientRequestIdCollision) {
      const raced = await prisma.order.findUnique({ where: { clientRequestId: input.clientRequestId }, include: orderInclude });
      if (raced) {
        if (raced.placedByStaffId !== input.placedByStaffId) {
          throw new ClientRequestIdConflictError();
        }
        return { order: raced, isNew: false };
      }
    }
    throw error;
  }
}

export interface UpdateSubmissionInput {
  items: CreateOrderItemInput[];
  deals?: CreateOrderDealInput[];
  notes?: string;
  // POS_ADMIN/SUPER_ADMIN only — checked by the controller before this is ever set.
  paymentMethod?: PaymentMethod;
  discount?: Prisma.Decimal;
  // Who made the edit — recorded on the DISCOUNT_SET event when the discount changes.
  actorId?: string;
}

// Replaces an AWAITING_RECEPTION order's contents wholesale (delete-then-recreate, unlike
// addOrderItems/removeOrderItem's incremental edits) and re-prices from scratch through the
// same buildOrderLines path createOrder uses. No inventory call either way — nothing was
// deducted for an order that's still awaiting reception.
export async function updateSubmission(orderId: string, input: UpdateSubmissionInput): Promise<OrderWithItems> {
  const updatedOrder = await replaceOrderContents(
    orderId,
    OrderStatus.AWAITING_RECEPTION,
    OrderNotAwaitingReceptionError,
    input,
  );

  emitSafely(() => {
    const io = getIO();
    const payload = { orderId: updatedOrder.id, orderNumber: updatedOrder.orderNumber };
    io.to("pos-admin").emit("order:updated", payload);
    if (updatedOrder.placedByStaffId) {
      io.to(`user:${updatedOrder.placedByStaffId}`).emit("order:updated", payload);
    }
  });

  return updatedOrder;
}

// Wholesale replace of an order's items/deal lines, re-priced through buildOrderLines, for an
// order that must still be in `requiredStatus` (AWAITING_RECEPTION for a submission edit,
// SCHEDULED for a scheduled-order edit) — neither has deducted any stock, so there's nothing
// to restock or re-deduct. The status is re-checked inside the transaction with a
// conditional UPDATE, which also row-locks the order: a concurrent status change (reception
// accepting it, the release job releasing it) either waits for this edit to commit and then
// acts on the edited contents, or wins first and makes this edit fail cleanly.
async function replaceOrderContents(
  orderId: string,
  requiredStatus: OrderStatus,
  NotInStatusError: new () => Error,
  input: UpdateSubmissionInput,
): Promise<OrderWithItems> {
  if (input.items.length === 0 && (input.deals ?? []).length === 0) {
    throw new EmptyOrderError();
  }

  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) {
    throw new OrderNotFoundError();
  }
  if (existing.status !== requiredStatus) {
    throw new NotInStatusError();
  }

  const { orderItemsCreateData, pendingDealLines } = await buildOrderLines(input.items, input.deals ?? []);
  const discount = input.discount ?? existing.discount;
  const itemsTotal = orderItemsCreateData.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
  const dealLinesTotal = pendingDealLines.reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0));
  const totalAmount = computeOrderTotal({ itemsTotal, dealLinesTotal, discount, deliveryFee: existing.deliveryFee });
  if (totalAmount.isNegative()) {
    throw new DiscountExceedsTotalError();
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.order.updateMany({
      where: { id: orderId, status: requiredStatus },
      data: { updatedAt: new Date() },
    });
    if (locked.count === 0) {
      throw new NotInStatusError();
    }

    // Replaces the order's whole contents — delete every existing item (direct and
    // deal-exploded) and deal line before rebuilding from the new input.
    await tx.orderItem.deleteMany({ where: { orderId } });
    await tx.orderDealLine.deleteMany({ where: { orderId } });

    await tx.order.update({
      where: { id: orderId },
      data: {
        totalAmount,
        discount,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
        items: { create: orderItemsCreateData },
      },
    });

    if (!discount.equals(existing.discount)) {
      await recordOrderEvent(tx, {
        orderId,
        actorId: input.actorId ?? null,
        type: OrderEventType.DISCOUNT_SET,
        before: { discount: money(existing.discount), totalAmount: money(existing.totalAmount) },
        after: { discount: money(discount), totalAmount: money(totalAmount) },
      });
    }

    for (const line of pendingDealLines) {
      const dealOrderLine = await tx.orderDealLine.create({
        data: {
          orderId,
          dealId: line.dealId,
          dealName: line.dealName,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          subtotal: line.subtotal,
          baseUnitPrice: line.baseUnitPrice,
          customization: line.customization,
          notes: line.notes,
        },
      });
      const explodedItemsData = line.explodedItems.map((item) => ({
        orderId,
        menuItemId: item.menuItemId,
        kitchenId: item.kitchenId,
        quantity: item.quantity,
        unitPrice: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(0),
        dealOrderLineId: dealOrderLine.id,
        variantId: item.variantId,
        variantLabel: item.variantLabel,
        addOns: item.addOns,
      }));
      await tx.orderItem.createMany({ data: explodedItemsData });
    }

    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });
}

export interface AcceptOrderInput {
  paymentMethod?: PaymentMethod;
  discount?: Prisma.Decimal;
  paymentVerified?: boolean;
}

export class InvalidReceptionActionError extends Error {}

const VALID_PAYMENT_METHODS = Object.values(PaymentMethod);

// Pure shape validation for POST /:id/accept's body — same "parse, don't inline-check in
// the controller" pattern as parseOrderItems/parseOrderDeals, so it's unit-testable
// without a database. Whether paymentVerified is actually *required* (an online order
// paid ONLINE) depends on the order itself — that's acceptOrder's job, not this.
export function parseAcceptInput(raw: unknown): AcceptOrderInput {
  const { paymentMethod, discount, paymentVerified, ...rest } = (raw ?? {}) as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    throw new InvalidReceptionActionError(`accept body has unknown field(s): ${Object.keys(rest).join(", ")}`);
  }
  if (paymentMethod !== undefined && !(VALID_PAYMENT_METHODS as unknown[]).includes(paymentMethod)) {
    throw new InvalidReceptionActionError(`paymentMethod must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`);
  }
  let discountDecimal: Prisma.Decimal | undefined;
  if (discount !== undefined) {
    if (typeof discount !== "string" && typeof discount !== "number") {
      throw new InvalidReceptionActionError("discount must be a non-negative number");
    }
    try {
      discountDecimal = new Prisma.Decimal(discount);
    } catch {
      throw new InvalidReceptionActionError("discount must be a non-negative number");
    }
    if (discountDecimal.isNaN() || discountDecimal.isNegative()) {
      throw new InvalidReceptionActionError("discount must be a non-negative number");
    }
  }
  if (paymentVerified !== undefined && typeof paymentVerified !== "boolean") {
    throw new InvalidReceptionActionError("paymentVerified must be a boolean");
  }
  return {
    ...(paymentMethod !== undefined ? { paymentMethod: paymentMethod as PaymentMethod } : {}),
    ...(discountDecimal !== undefined ? { discount: discountDecimal } : {}),
    ...(paymentVerified !== undefined ? { paymentVerified } : {}),
  };
}

// Reception's "yes, send it to the kitchen." One transaction: sets the status an order
// placed directly would have had (PENDING for an ORDER_TAKER order, CONFIRMED for an
// online one), stamps who/when, deducts inventory exactly like createOrder does for a
// staff-placed order. After commit, pushes to the kitchen(s) via the same function
// createOrder uses — a kitchen never learns about an order any other way than this or a
// direct POS createOrder.
export async function acceptOrder(orderId: string, acceptedById: string, input: AcceptOrderInput): Promise<OrderWithItems> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: { select: { menuItemId: true, quantity: true, subtotal: true } },
      dealLines: { select: { subtotal: true } },
    },
  });
  if (!existing) {
    throw new OrderNotFoundError();
  }
  if (existing.status !== OrderStatus.AWAITING_RECEPTION) {
    throw new OrderNotAwaitingReceptionError();
  }

  const isOnlinePaid = existing.source === OrderSource.ONLINE && existing.paymentMethod === PaymentMethod.ONLINE;
  if (isOnlinePaid && input.paymentVerified !== true) {
    throw new PaymentNotVerifiedError();
  }
  // A guest order paid ONLINE is placed first and the proof uploaded afterwards, so reception can
  // see one with nothing to verify. It can't be accepted as paid until a proof exists — unless
  // reception switches it to cash in this same call.
  if (
    isOnlinePaid &&
    existing.publicId !== null &&
    existing.paymentProofMediaId === null &&
    existing.paymentScreenshotUrl === null &&
    input.paymentMethod !== PaymentMethod.CASH
  ) {
    throw new PaymentProofMissingError();
  }

  let totalAmount: Prisma.Decimal | undefined;
  if (input.discount !== undefined) {
    const itemsTotal = existing.items.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
    const dealLinesTotal = existing.dealLines.reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0));
    totalAmount = computeOrderTotal({
      itemsTotal,
      dealLinesTotal,
      discount: input.discount,
      deliveryFee: existing.deliveryFee,
    });
    if (totalAmount.isNegative()) {
      throw new DiscountExceedsTotalError();
    }
  }

  // Online orders become CONFIRMED; staff-placed ones (an ORDER_TAKER's, or a released
  // scheduled POS order) become PENDING — what a directly-placed POS order starts as.
  const nextStatus = existing.source === OrderSource.ONLINE ? OrderStatus.CONFIRMED : OrderStatus.PENDING;

  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        status: nextStatus,
        acceptedById,
        acceptedAt: new Date(),
        ...(input.paymentMethod !== undefined ? { paymentMethod: input.paymentMethod } : {}),
        ...(input.discount !== undefined ? { discount: input.discount } : {}),
        ...(totalAmount !== undefined ? { totalAmount } : {}),
        ...(isOnlinePaid ? { paymentStatus: PaymentStatus.VERIFIED, paymentVerifiedById: acceptedById } : {}),
      },
      include: orderInclude,
    });

    await inventoryService.deductForOrderItems(tx, {
      orderId,
      performedById: acceptedById,
      items: existing.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
    });

    await recordOrderEvent(tx, {
      orderId,
      actorId: acceptedById,
      type: OrderEventType.ACCEPTED,
      before: { status: existing.status },
      after: { status: nextStatus, paymentMethod: updated.paymentMethod },
    });
    if (input.discount !== undefined && totalAmount !== undefined && !input.discount.equals(existing.discount)) {
      await recordOrderEvent(tx, {
        orderId,
        actorId: acceptedById,
        type: OrderEventType.DISCOUNT_SET,
        before: { discount: money(existing.discount), totalAmount: money(existing.totalAmount) },
        after: { discount: money(input.discount), totalAmount: money(totalAmount) },
      });
    }
    if (isOnlinePaid && existing.paymentStatus !== PaymentStatus.VERIFIED) {
      await recordOrderEvent(tx, {
        orderId,
        actorId: acceptedById,
        type: OrderEventType.PAYMENT_MARKED,
        before: { paymentStatus: existing.paymentStatus },
        after: { paymentStatus: PaymentStatus.VERIFIED, totalAmount: money(updated.totalAmount) },
      });
    }

    return updated;
  });

  emitNewOrderItemsByKitchen(order);
  emitSafely(() => {
    const io = getIO();
    const payload = { orderId: order.id, orderNumber: order.orderNumber };
    io.to("pos-admin").emit("order:accepted", payload);
    if (order.placedByStaffId) {
      io.to(`user:${order.placedByStaffId}`).emit("order:accepted", payload);
    }
  });
  emitOrderStatusToTaker(order);

  return order;
}

export interface RejectOrderInput {
  reason: string;
  paymentRejected?: boolean;
}

// Pure shape validation for POST /:id/reject's body — same pattern as parseAcceptInput.
export function parseRejectInput(raw: unknown): RejectOrderInput {
  const { reason, paymentRejected, ...rest } = (raw ?? {}) as Record<string, unknown>;
  if (Object.keys(rest).length > 0) {
    throw new InvalidReceptionActionError(`reject body has unknown field(s): ${Object.keys(rest).join(", ")}`);
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new InvalidReceptionActionError("reason is required");
  }
  if (paymentRejected !== undefined && typeof paymentRejected !== "boolean") {
    throw new InvalidReceptionActionError("paymentRejected must be a boolean");
  }
  return {
    reason: reason.trim(),
    ...(paymentRejected !== undefined ? { paymentRejected } : {}),
  };
}

// Reception's "no, send it back." Nothing to restock — an AWAITING_RECEPTION order never
// deducted inventory in the first place.
export async function rejectOrder(orderId: string, input: RejectOrderInput, actorId: string): Promise<OrderWithItems> {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing) {
    throw new OrderNotFoundError();
  }
  if (existing.status !== OrderStatus.AWAITING_RECEPTION) {
    throw new OrderNotAwaitingReceptionError();
  }

  const order = await prisma.$transaction(async (tx) => {
    const rejected = await tx.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledReason: input.reason,
        cancelledAt: new Date(),
        cancelledById: actorId,
        ...(input.paymentRejected ? { paymentStatus: PaymentStatus.REJECTED } : {}),
      },
      include: orderInclude,
    });
    await recordOrderEvent(tx, {
      orderId,
      actorId,
      type: OrderEventType.REJECTED,
      reason: input.reason,
      before: { status: existing.status, paymentStatus: existing.paymentStatus },
      after: { status: rejected.status, paymentStatus: rejected.paymentStatus },
    });
    return rejected;
  });

  emitSafely(() => {
    const io = getIO();
    const payload = { orderId: order.id, orderNumber: order.orderNumber, reason: input.reason };
    io.to("pos-admin").emit("order:rejected", payload);
    if (order.placedByStaffId) {
      io.to(`user:${order.placedByStaffId}`).emit("order:rejected", payload);
    }
  });
  emitOrderStatusToTaker(order);

  return order;
}

// The order has been handed over / delivered: the only way an order reaches COMPLETED. Allowed
// for an accepted order only — never for one still at reception, on hold, cancelled, or already
// done. Nothing about items or stock changes (they were settled at accept).
const DELIVERABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.IN_KITCHEN,
  OrderStatus.READY,
];

export async function markOrderDelivered(orderId: string): Promise<OrderWithItems> {
  const existing = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
  if (!existing) {
    throw new OrderNotFoundError();
  }
  if (!DELIVERABLE_STATUSES.includes(existing.status)) {
    throw new OrderNotDeliverableError(existing.status);
  }

  // Conditional on the status we just read, so a concurrent cancel can't be overwritten.
  const updated = await prisma.order.updateMany({
    where: { id: orderId, status: { in: DELIVERABLE_STATUSES } },
    data: { status: OrderStatus.COMPLETED },
  });
  if (updated.count === 0) {
    const now = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    throw new OrderNotDeliverableError(now?.status ?? existing.status);
  }

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  emitSafely(() => getIO().to("pos-admin").emit("order:updated", { orderId: order.id, orderNumber: order.orderNumber }));
  emitOrderStatusToTaker(order);
  return order;
}

// An accepted online PICKUP order the customer never came for. The order is cancelled (the same plain cancel as
// cancelOrder: nothing is restocked, the food was made) and flagged with notCollectedAt, which counts as a strike
// for the phone number (see guestOrderLimits: repeat no-shows are refused new guest orders).
export class OrderNotCollectableError extends Error {
  constructor(public readonly reason: "NOT_PICKUP" | "STATUS", public readonly status: OrderStatus) {
    super(reason === "NOT_PICKUP" ? "Only online pickup orders can be marked not collected" : `This order is ${status} and cannot be marked not collected`);
  }
}

export const NOT_COLLECTED_REASON = "Not collected";

export async function markOrderNotCollected(orderId: string, actorId: string): Promise<OrderWithItems> {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      source: true,
      type: true,
      paymentStatus: true,
      totalAmount: true,
      items: { select: { id: true, kitchenId: true } },
    },
  });
  if (!existing) {
    throw new OrderNotFoundError();
  }
  if (existing.source !== OrderSource.ONLINE || existing.type !== OrderType.TAKEAWAY) {
    throw new OrderNotCollectableError("NOT_PICKUP", existing.status);
  }
  if (!DELIVERABLE_STATUSES.includes(existing.status)) {
    throw new OrderNotCollectableError("STATUS", existing.status);
  }
  // Conditional on the status we just read, so a concurrent delivery can't be overwritten.
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { id: orderId, status: { in: DELIVERABLE_STATUSES } },
      data: {
        status: OrderStatus.CANCELLED,
        cancelledReason: NOT_COLLECTED_REASON,
        notCollectedAt: new Date(),
        cancelledAt: new Date(),
        cancelledById: actorId,
      },
    });
    if (result.count > 0) {
      await recordOrderEvent(tx, {
        orderId,
        actorId,
        type: OrderEventType.CANCELLED,
        reason: NOT_COLLECTED_REASON,
        before: cancelSnapshot(existing),
        after: { status: OrderStatus.CANCELLED },
      });
    }
    return result;
  });
  if (updated.count === 0) {
    const now = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    throw new OrderNotCollectableError("STATUS", now?.status ?? existing.status);
  }
  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  emitSafely(() => getIO().to("pos-admin").emit("order:updated", { orderId: order.id, orderNumber: order.orderNumber }));
  emitOrderCancelled(order, existing.items, true);
  emitOrderStatusToTaker(order);
  return order;
}

// Reception's inbox — every order nobody has reviewed yet, oldest first (first come, first
// reviewed). orderInclude already carries everything the inbox needs (items, deal lines,
// taker name, customer name/phone/address, payment fields) with no extra query.
//
// A released scheduled order joins the queue at the moment it was released (releasedAt), not
// when it was originally placed — otherwise one scheduled hours ago would jump the line.
export async function getIncomingOrders(businessDayId: string, publicCode?: string, source?: OrderSource) {
  const orders = await prisma.order.findMany({
    where: {
      businessDayId,
      status: OrderStatus.AWAITING_RECEPTION,
      ...(publicCode !== undefined ? { publicCode } : {}),
      // An ONLINE_ADMIN reviews online orders only (see the order routes).
      ...(source !== undefined ? { source } : {}),
    },
    include: orderInclude,
    orderBy: { createdAt: "asc" },
  });
  const arrivedAt = (order: (typeof orders)[number]) => (order.releasedAt ?? order.createdAt).getTime();
  return orders.sort((a, b) => arrivedAt(a) - arrivedAt(b));
}

export class NotCashPaymentError extends Error {}

export class DiscountExceedsTotalError extends Error {}

export interface UpdatePaymentStatusOptions {
  // A flat amount off, replacing whatever discount the order had. Recomputes totalAmount
  // fresh from the live item/deal-line subtotals — never trusts a client-sent total.
  discount?: Prisma.Decimal;
  // How much cash was actually handed over. Snapshotted as-is; change due (paidAmount -
  // totalAmount) is computed on demand wherever it's shown, never stored.
  paidAmount?: Prisma.Decimal;
  // Who did it — recorded on the PAYMENT_MARKED/PAYMENT_UNMARKED and DISCOUNT_SET events.
  actorId?: string;
}

// Quick toggle for the POS cash workflow (pay-after-eating): PENDING <-> VERIFIED, optionally
// setting a discount and/or the amount actually collected in the same call (the "confirm
// payment" flow on OrderDetailPage). Deliberately separate from — and restricted to CASH,
// excluding — the online AWAITING_VERIFICATION/REJECTED flow in the payment module. That flow
// requires an ONLINE_ADMIN to check a payment screenshot before marking VERIFIED; letting this
// POS-only toggle (reachable by POS_ADMIN) touch an ONLINE-payment-method order would let
// staff mark it paid without ever looking at that screenshot.
export async function updatePaymentStatus(
  id: string,
  paymentStatus: PaymentStatus,
  options?: UpdatePaymentStatusOptions,
): Promise<OrderWithItems> {
  const existing = await prisma.order.findUnique({
    where: { id },
    select: {
      paymentMethod: true,
      paymentStatus: true,
      paidAmount: true,
      discount: true,
      totalAmount: true,
      deliveryFee: true,
      items: { select: { subtotal: true } },
      dealLines: { select: { subtotal: true } },
    },
  });
  if (!existing) {
    throw new OrderNotFoundError();
  }
  if (existing.paymentMethod !== PaymentMethod.CASH) {
    throw new NotCashPaymentError();
  }

  let totalAmount: Prisma.Decimal | undefined;
  if (options?.discount !== undefined) {
    const itemsTotal = existing.items.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));
    const dealLinesTotal = existing.dealLines.reduce((sum, line) => sum.plus(line.subtotal), new Prisma.Decimal(0));
    totalAmount = computeOrderTotal({
      itemsTotal,
      dealLinesTotal,
      discount: options.discount,
      deliveryFee: existing.deliveryFee,
    });
    if (totalAmount.isNegative()) {
      throw new DiscountExceedsTotalError();
    }
  }

  // Reversing to PENDING clears a previously-recorded paid amount — it's no longer accurate
  // once the order is no longer considered paid. The discount itself is left alone; it's
  // business data (a discount given), not a payment-confirmation artifact.
  const paidAmount = paymentStatus === PaymentStatus.PENDING ? null : options?.paidAmount;

  const actorId = options?.actorId ?? null;
  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { id },
      data: {
        paymentStatus,
        ...(options?.discount !== undefined ? { discount: options.discount } : {}),
        ...(totalAmount !== undefined ? { totalAmount } : {}),
        ...(paidAmount !== undefined ? { paidAmount } : {}),
      },
      include: orderInclude,
    });

    if (options?.discount !== undefined && !options.discount.equals(existing.discount)) {
      await recordOrderEvent(tx, {
        orderId: id,
        actorId,
        type: OrderEventType.DISCOUNT_SET,
        before: { discount: money(existing.discount), totalAmount: money(existing.totalAmount) },
        after: { discount: money(updated.discount), totalAmount: money(updated.totalAmount) },
      });
    }
    if (paymentStatus !== existing.paymentStatus) {
      await recordOrderEvent(tx, {
        orderId: id,
        actorId,
        type: paymentStatus === PaymentStatus.VERIFIED ? OrderEventType.PAYMENT_MARKED : OrderEventType.PAYMENT_UNMARKED,
        before: { paymentStatus: existing.paymentStatus, paidAmount: money(existing.paidAmount) },
        after: { paymentStatus, paidAmount: money(updated.paidAmount), totalAmount: money(updated.totalAmount) },
      });
    }
    return updated;
  });
  return order;
}

const CLOSED_ORDER_STATUSES = new Set<OrderStatus>([OrderStatus.CANCELLED, OrderStatus.COMPLETED]);

// "2 × Zinger Burger (Large)" — how an item line reads in its audit event.
function describeLine(item: { quantity: number; variantLabel: string | null; menuItem: { name: string } }): string {
  return `${item.quantity} × ${item.menuItem.name}${item.variantLabel ? ` (${item.variantLabel})` : ""}`;
}

export interface AddOrderItemsInput {
  items: CreateOrderItemInput[];
  performedById: string;
}

// Adds items to an already-placed order — the customer asked for more after the
// initial order went in. Mirrors createOrder's per-item pricing/validation, then
// appends rather than replacing: existing items, deal lines, and their statuses are
// untouched. New items start at PENDING like any freshly ordered item, deduct
// inventory the same way, and get pushed to the relevant kitchen(s) over the socket.
export async function addOrderItems(orderId: string, input: AddOrderItemsInput): Promise<OrderWithItems> {
  if (input.items.length === 0) {
    throw new InvalidOrderItemsError("items must include at least one item");
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) {
    throw new OrderNotFoundError();
  }
  if (CLOSED_ORDER_STATUSES.has(order.status)) {
    throw new OrderClosedError();
  }
  // An AWAITING_RECEPTION order isn't real yet — editing it goes through
  // PUT /:id/submission only, never this incremental add.
  if (order.status === OrderStatus.AWAITING_RECEPTION) {
    throw new OrderAwaitingReceptionError();
  }
  // Same for a SCHEDULED one (PUT /:id/scheduled-items) — this path deducts stock and pushes
  // to kitchens, neither of which may happen before release.
  if (order.status === OrderStatus.SCHEDULED) {
    throw new OrderScheduledError();
  }

  const menuItemIds = [...new Set(input.items.map((item) => item.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    include: { variants: true },
  });
  const menuItemById = new Map(menuItems.map((menuItem) => [menuItem.id, menuItem]));

  for (const menuItemId of menuItemIds) {
    if (!menuItemById.has(menuItemId)) {
      throw new MenuItemNotFoundError(menuItemId);
    }
  }

  const addOnById = await loadAddOnById(input.items);

  const newItemsData = input.items.map((item) => {
    // Non-null: existence of every menuItemId was just verified above.
    const menuItem = menuItemById.get(item.menuItemId)!;
    const {
      unitPrice: basePrice,
      variantId,
      variantLabel,
      isCustomPrice,
    } = resolveItemPrice(menuItem, item.variantId, item.unitPrice);
    const { addOns, addOnsTotal } = resolveAddOns(menuItem, variantLabel, item.addOnIds, addOnById);
    const unitPrice = basePrice.plus(addOnsTotal);
    return {
      menuItemId: item.menuItemId,
      kitchenId: menuItem.kitchenId,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice.times(item.quantity),
      variantId,
      variantLabel,
      addOns,
      isCustomPrice,
      ...(item.notes !== undefined ? { notes: item.notes } : {}),
    };
  });

  const addedTotal = newItemsData.reduce((sum, item) => sum.plus(item.subtotal), new Prisma.Decimal(0));

  const { updatedOrder, createdItems } = await prisma.$transaction(async (tx) => {
    const created: OrderWithItems["items"] = [];
    for (const itemData of newItemsData) {
      const row = await tx.orderItem.create({
        data: { ...itemData, orderId },
        // dealOrderLine is always null here — items added post-creation are never part of a
        // deal — but the include must match orderInclude's shape for OrderWithItems to typecheck.
        include: orderItemInclude,
      });
      created.push(row);
    }

    const totals = await tx.order.update({
      where: { id: orderId },
      data: { totalAmount: { increment: addedTotal } },
      select: { totalAmount: true },
    });

    await recordOrderEvent(tx, {
      orderId,
      actorId: input.performedById,
      type: OrderEventType.ITEM_ADDED,
      before: { totalAmount: money(totals.totalAmount.minus(addedTotal)) },
      after: { totalAmount: money(totals.totalAmount), items: created.map(describeLine) },
    });

    await inventoryService.deductForOrderItems(tx, {
      orderId,
      performedById: input.performedById,
      items: input.items.map((item) => ({ menuItemId: item.menuItemId, quantity: item.quantity })),
    });

    const refetched = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    return { updatedOrder: refetched, createdItems: created };
  });

  // Only the newly added items are pushed to the kitchen(s) — the rest of the order
  // was already seen when it was first placed.
  emitNewOrderItemsByKitchen({ ...updatedOrder, items: createdItems });

  return updatedOrder;
}

// Removes an item that hasn't been started yet — once the kitchen has picked it up
// (PREPARING/READY/SERVED) it's too late to just delete it; that needs a cancellation
// conversation with the customer, not a silent removal. An item exploded out of a deal
// can't be removed on its own either — removing one piece of a deal would leave the
// deal's price covering a composition that no longer matches what's on the order.
export async function removeOrderItem(orderId: string, itemId: string, performedById: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { menuItem: { select: { name: true } } } }, dealLines: true },
  });
  if (!order) {
    throw new OrderNotFoundError();
  }
  if (CLOSED_ORDER_STATUSES.has(order.status)) {
    throw new OrderClosedError();
  }
  if (order.status === OrderStatus.AWAITING_RECEPTION) {
    throw new OrderAwaitingReceptionError();
  }
  if (order.status === OrderStatus.SCHEDULED) {
    throw new OrderScheduledError();
  }

  const item = order.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new OrderItemNotFoundError();
  }
  if (item.dealOrderLineId !== null) {
    throw new DealOrderItemError();
  }
  if (item.status !== OrderItemStatus.PENDING) {
    throw new OrderItemNotPendingError();
  }
  if (order.items.length === 1 && order.dealLines.length === 0) {
    throw new EmptyOrderError();
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.orderItem.delete({ where: { id: itemId } });

    const totals = await tx.order.update({
      where: { id: orderId },
      data: { totalAmount: { decrement: item.subtotal } },
      select: { totalAmount: true },
    });

    await recordOrderEvent(tx, {
      orderId,
      actorId: performedById,
      type: OrderEventType.ITEM_REMOVED,
      before: {
        item: describeLine(item),
        subtotal: money(item.subtotal),
        totalAmount: money(totals.totalAmount.plus(item.subtotal)),
      },
      after: { totalAmount: money(totals.totalAmount) },
    });

    await inventoryService.restockForOrderItems(tx, {
      orderId,
      performedById,
      items: [{ menuItemId: item.menuItemId, quantity: item.quantity }],
    });

    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  });

  emitItemsGone("order-item:removed", updatedOrder, [item], true);
  return updatedOrder;
}

// ================= Per-line notes (editing after placement) =================

// Same window as adding/removing items: any order that's live in the kitchen flow. An
// AWAITING_RECEPTION order's notes are edited with the rest of it via PUT /:id/submission.
function assertLineNotesEditable(status: OrderStatus): void {
  if (CLOSED_ORDER_STATUSES.has(status)) {
    throw new OrderClosedError();
  }
  if (status === OrderStatus.AWAITING_RECEPTION) {
    throw new OrderAwaitingReceptionError();
  }
  // Notes on a scheduled order are edited with its items (PUT /:id/scheduled-items) — this
  // path pushes to kitchens.
  if (status === OrderStatus.SCHEDULED) {
    throw new OrderScheduledError();
  }
}

// Every order reaching this point has already been sent to the kitchen (see
// assertLineNotesEditable), so the affected items are pushed to their kitchen(s) exactly
// like newly added items are — except ones already SERVED, which have left the kitchen.
function emitNoteUpdatedToKitchens(order: OrderWithItems, affectedItemIds: Set<string>): void {
  const items = order.items.filter(
    (item) => affectedItemIds.has(item.id) && item.status !== OrderItemStatus.SERVED,
  );
  if (items.length > 0) {
    emitSafely(() => emitOrderItemsByKitchen("order-item:note-updated", order, items));
  }
}

// Sets, changes, or clears (notes: null) the note on one directly-ordered item. A deal's
// exploded items share their deal line's note — that's edited via updateOrderDealLineNote.
export async function updateOrderItemNote(orderId: string, itemId: string, notes: string | null): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, items: { where: { id: itemId }, select: { id: true, notes: true, dealOrderLineId: true } } },
  });
  if (!order) {
    throw new OrderNotFoundError();
  }
  assertLineNotesEditable(order.status);
  const item = order.items[0];
  if (!item) {
    throw new OrderItemNotFoundError();
  }
  if (item.dealOrderLineId !== null) {
    throw new DealOrderItemError();
  }

  const changed = item.notes !== notes;
  if (changed) {
    await prisma.orderItem.update({ where: { id: itemId }, data: { notes } });
  }
  const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  if (changed) {
    emitNoteUpdatedToKitchens(updated, new Set([itemId]));
  }
  return updated;
}

// Sets, changes, or clears the note on a whole deal line — every item exploded from it
// shows that note, so each one still in a kitchen gets the update.
export async function updateOrderDealLineNote(
  orderId: string,
  dealLineId: string,
  notes: string | null,
): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, dealLines: { where: { id: dealLineId }, select: { id: true, notes: true } } },
  });
  if (!order) {
    throw new OrderNotFoundError();
  }
  assertLineNotesEditable(order.status);
  const line = order.dealLines[0];
  if (!line) {
    throw new OrderDealLineNotFoundError();
  }

  const changed = line.notes !== notes;
  if (changed) {
    await prisma.orderDealLine.update({ where: { id: dealLineId }, data: { notes } });
  }
  const updated = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
  if (changed) {
    const explodedIds = updated.items.filter((item) => item.dealOrderLineId === dealLineId).map((item) => item.id);
    emitNoteUpdatedToKitchens(updated, new Set(explodedIds));
  }
  return updated;
}

// ================= Scheduled orders (SCHEDULED → AWAITING_RECEPTION) =================

// The one and only way out of SCHEDULED into the live flow. The conditional UPDATE is what
// makes release exactly-once: however many callers race — the 30-second job on two server
// instances, the startup catch-up, "Release now", ending the day — Postgres lets exactly one
// UPDATE match `status = SCHEDULED`; every other gets count 0 and does nothing. Only the
// winner emits. After this the order is an ordinary incoming order: Incoming orders + the
// chime (order:submitted), and reception's accept then notifies kitchens, prints and deducts
// stock exactly as for any other incoming order.
//
// `dueBy` set (the job) additionally requires scheduledFor <= dueBy, so a reschedule that
// lands between the job's read and this UPDATE is respected. Returns the released order, or
// null if this call didn't release it.
export async function releaseScheduledOrder(
  orderId: string,
  options: { dueBy?: Date; now?: Date } = {},
): Promise<OrderWithItems | null> {
  const now = options.now ?? new Date();
  const { order } = await transitionScheduledOrder(
    orderId,
    { status: OrderStatus.AWAITING_RECEPTION, releasedAt: now },
    options.dueBy !== undefined ? { scheduledFor: { lte: options.dueBy } } : {},
  );
  if (order) {
    emitSafely(() => getIO().to("pos-admin").emit("order:submitted", buildSubmittedPayload(order)));
  }
  return order;
}

// The single primitive behind every scheduled-order action (release, reschedule, cancel):
// a conditional UPDATE that only matches while the order is still SCHEDULED (plus any extra
// condition), and the read of the result, in one transaction — so the order returned is
// exactly the one this call changed, and `exists` tells "no longer scheduled" apart from
// "no such order" without a second, racing round trip. `order` is null when this call
// changed nothing.
async function transitionScheduledOrder(
  orderId: string,
  data: Prisma.OrderUncheckedUpdateManyInput,
  extraWhere: Prisma.OrderWhereInput = {},
  // Runs inside the same transaction, only when this call made the change (e.g. its audit event).
  onChanged?: (tx: Prisma.TransactionClient, order: OrderWithItems) => Promise<unknown>,
): Promise<{ order: OrderWithItems | null; exists: boolean }> {
  return prisma.$transaction(async (tx) => {
    const result = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.SCHEDULED, ...extraWhere },
      data,
    });
    if (result.count === 0) {
      const exists = (await tx.order.count({ where: { id: orderId } })) > 0;
      return { order: null, exists };
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    await onChanged?.(tx, order);
    return { order, exists: true };
  });
}

// The recurring job's body (see scheduledRelease.job.ts) — and the startup catch-up, which is
// the same call: anything already overdue goes out on the first run. The database is the
// only source of truth, so a restart (every deploy) loses nothing.
export async function releaseDueScheduledOrders(now: Date = new Date()): Promise<OrderWithItems[]> {
  const due = await prisma.order.findMany({
    where: { status: OrderStatus.SCHEDULED, scheduledFor: { lte: now } },
    select: { id: true },
    orderBy: { scheduledFor: "asc" },
  });
  const released: OrderWithItems[] = [];
  for (const { id } of due) {
    const order = await releaseScheduledOrder(id, { dueBy: now, now });
    if (order) {
      released.push(order);
    }
  }
  return released;
}

// "Release now" from the Scheduled list / order detail / ending the day.
export async function releaseScheduledOrderNow(orderId: string): Promise<OrderWithItems> {
  const now = new Date();
  const { order, exists } = await transitionScheduledOrder(orderId, {
    status: OrderStatus.AWAITING_RECEPTION,
    releasedAt: now,
  });
  if (!order) {
    throw exists ? new OrderNotScheduledError() : new OrderNotFoundError();
  }
  emitSafely(() => getIO().to("pos-admin").emit("order:submitted", buildSubmittedPayload(order)));
  return order;
}

// The Scheduled list: everything still on hold, soonest first, with the same detail an
// incoming order carries. Not scoped to a business day — there's only ever one active day,
// and ending it requires resolving these first (see businessDay.controller.ts).
export function listScheduledOrders() {
  return prisma.order.findMany({
    where: { status: OrderStatus.SCHEDULED },
    include: orderInclude,
    orderBy: { scheduledFor: "asc" },
  });
}

export function listScheduledOrdersForBusinessDay(businessDayId: string) {
  return prisma.order.findMany({
    where: { businessDayId, status: OrderStatus.SCHEDULED },
    select: { id: true, orderNumber: true, scheduledFor: true },
    orderBy: { scheduledFor: "asc" },
  });
}

export async function rescheduleOrder(orderId: string, scheduledFor: Date): Promise<OrderWithItems> {
  const { order, exists } = await transitionScheduledOrder(orderId, { scheduledFor });
  if (!order) {
    throw exists ? new OrderNotScheduledError() : new OrderNotFoundError();
  }
  return order;
}

// Edit a scheduled order's items/deals (and their notes) — wholesale, like a submission edit,
// keeping its discount. Only while it's still SCHEDULED (see replaceOrderContents's lock).
export function updateScheduledItems(
  orderId: string,
  input: { items: CreateOrderItemInput[]; deals?: CreateOrderDealInput[] },
): Promise<OrderWithItems> {
  return replaceOrderContents(orderId, OrderStatus.SCHEDULED, OrderNotScheduledError, input);
}

// Cancels only if still on hold — never a just-released order by accident (that goes through
// the normal cancel/reject paths, where reception can see it). Nothing to restock: a
// scheduled order never deducted anything.
export async function cancelScheduledOrder(orderId: string, reason: string, actorId: string): Promise<OrderWithItems> {
  const { order, exists } = await transitionScheduledOrder(
    orderId,
    { status: OrderStatus.CANCELLED, cancelledReason: reason, cancelledAt: new Date(), cancelledById: actorId },
    {},
    (tx, cancelled) =>
      recordOrderEvent(tx, {
        orderId,
        actorId,
        type: OrderEventType.CANCELLED,
        reason,
        before: cancelSnapshot({ ...cancelled, status: OrderStatus.SCHEDULED }),
        after: { status: OrderStatus.CANCELLED },
      }),
  );
  if (!order) {
    throw exists ? new OrderNotScheduledError() : new OrderNotFoundError();
  }
  return order;
}

export function getOrderItem(orderId: string, itemId: string) {
  return prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
}

export async function updateOrderItemStatus(itemId: string, status: OrderItemStatus) {
  // In practice an AWAITING_RECEPTION order's items are already hidden from the kitchen
  // queue (see getKitchenQueue below), so a kitchen UI shouldn't be able to reach this at
  // all for one — this guard is for direct API misuse, not a UI path that exists today.
  const existing = await prisma.orderItem.findUniqueOrThrow({
    where: { id: itemId },
    select: { order: { select: { status: true } } },
  });
  if (existing.order.status === OrderStatus.AWAITING_RECEPTION) {
    throw new OrderAwaitingReceptionError();
  }
  if (existing.order.status === OrderStatus.SCHEDULED) {
    throw new OrderScheduledError();
  }

  const updated = await prisma.orderItem.update({
    where: { id: itemId },
    data: { status },
    include: { order: { select: { id: true, orderNumber: true } } },
  });

  // Both the admin dashboard and that item's own kitchen display need this live —
  // a kitchen socket only ever joins its own kitchen:<id> room, never pos-admin.
  getIO().to("pos-admin").to(`kitchen:${updated.kitchenId}`).emit("order-item:updated", updated);

  return updated;
}

export function kitchenExists(id: string) {
  return prisma.kitchen.findUnique({ where: { id }, select: { id: true } }).then(Boolean);
}

export function getKitchenQueue(kitchenId: string) {
  return prisma.orderItem.findMany({
    where: {
      kitchenId,
      status: { in: [OrderItemStatus.PENDING, OrderItemStatus.PREPARING] },
      // An AWAITING_RECEPTION order's items are real PENDING rows in the database (the
      // kitchen emit is just skipped at creation) — without this, a reload of the kitchen
      // screen would surface them anyway via this plain REST refetch.
      // Same for a SCHEDULED order's items, which aren't released yet.
      order: { status: { notIn: [OrderStatus.AWAITING_RECEPTION, OrderStatus.SCHEDULED] } },
    },
    include: {
      order: { select: { orderNumber: true, diningArea: true } },
      ...orderItemInclude,
    },
    orderBy: { createdAt: "desc" },
  });
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

export function isForeignKeyConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

// A JWT stays valid (and keeps passing auth) even after the StaffUser it names has been
// deleted — the token is only ever signature-checked, never looked up against the DB.
// Placing an order with such a token fails here, on the required placedByStaffId FK,
// which otherwise surfaces as a confusing generic "doesn't reference an existing record"
// message. Detecting it lets the controller return 401 instead, so the frontend's
// existing "session expired" handling kicks in and sends the user back to login.
export function isStalePlacedByStaffError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003" &&
    typeof error.meta?.constraint === "string" &&
    error.meta.constraint.includes("placedByStaffId")
  );
}

// The id of the order's payment-proof media asset, or null (no such order / no proof yet). The
// staff route that serves the image reads the bytes through the media service.
export async function getOrderPaymentProofId(orderId: string): Promise<string | null> {
  const row = await prisma.order.findUnique({ where: { id: orderId }, select: { paymentProofMediaId: true } });
  return row?.paymentProofMediaId ?? null;
}

// Where an order came from, or null if there is no such order. Used to keep an ONLINE_ADMIN to
// online orders when they accept or reject from Incoming.
export async function getOrderSource(orderId: string): Promise<OrderSource | null> {
  const row = await prisma.order.findUnique({ where: { id: orderId }, select: { source: true } });
  return row?.source ?? null;
}
