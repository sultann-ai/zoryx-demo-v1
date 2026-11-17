import type { Kitchen } from "../api/kitchens";
import type { OrderDetail, OrderItem } from "../api/orders";
import { orderTypeLabel } from "../lib/enumLabels";
import { getOrderCustomer, isPickup } from "../lib/orderCustomer";
import { formatTime } from "../lib/format";
import { itemNoteLines } from "../lib/lineNotes";
import { formatShopTime } from "../lib/shopTime";

// The kitchen slip, as data. Every kitchen with at least one item on the order gets a slip,
// and every slip lists ALL of the order's items, grouped by kitchen — so each kitchen can
// match its dishes against everyone else's before the food goes out. The slips differ only
// in whose kitchen they're for: that kitchen is named in the header and its group comes
// first, bold and large; the rest follow, smaller, under "Other kitchens".
//
// Both renderers read this one model — buildKitchenTicketDocs (ESC/POS via the print agent)
// and PrintKitchenTicketsPage (browser printing) — so the two layouts can't drift apart.

export interface SlipItem {
  id: string;
  // "2x Zinger Burger (Large)" — quantity, name and size.
  title: string;
  // "+ Cheese, + Jalapeno" — empty when none.
  addOns: string;
  // "(Family Deal)" / "(Family Deal - customized)" for an item exploded from a deal.
  dealTag: string | null;
  // The item's own note and, for a deal item, its deal line's note.
  notes: string[];
  // Set when this print is for items just added to the order: "ADDED", or "ADDED +1" when
  // only part of the line's quantity is new.
  addedMark: string | null;
}

export interface SlipKitchenGroup {
  kitchenId: string;
  kitchenName: string;
  items: SlipItem[];
}

export interface KitchenSlip {
  kitchenId: string;
  kitchenName: string;
  orderNumber: number;
  // "Table: Table 5 (Family Hall)", "TAKEAWAY" or "DELIVERY".
  placeLine: string;
  typeLine: string;
  timeLine: string;
  scheduledLine: string | null;
  // Who it's for and where it goes (name - phone, the address lines, the order code). Empty for a
  // dine-in order. No money: the delivery fee is on the customer receipt only.
  customerLines: string[];
  // Takeaway/delivery orders: every item leaves the building — say so on every slip.
  packLine: string | null;
  // "ITEMS ADDED: 2" — only on a print made because items were added.
  addedLine: string | null;
  own: SlipKitchenGroup;
  others: SlipKitchenGroup[];
}

// Item id → how many of that line's quantity are newly added (≤ its quantity).
export type AddedQuantities = ReadonlyMap<string, number>;

export interface KitchenSlipOptions {
  added?: AddedQuantities;
}

function slipItem(item: OrderItem, added: AddedQuantities | undefined): SlipItem {
  const addedQuantity = Math.min(added?.get(item.id) ?? 0, item.quantity);
  return {
    id: item.id,
    title: `${item.quantity}x ${item.menuItem.name}${item.variantLabel ? ` (${item.variantLabel})` : ""}`,
    addOns: (item.addOns ?? []).map((addOn) => `+ ${addOn.name}`).join(", "),
    dealTag: item.dealOrderLine
      ? `(${item.dealOrderLine.dealName}${item.dealOrderLine.customization ? " - customized" : ""})`
      : null,
    notes: itemNoteLines(item),
    addedMark: addedQuantity <= 0 ? null : addedQuantity >= item.quantity ? "ADDED" : `ADDED +${addedQuantity}`,
  };
}

// Kitchens in a stable order on every slip: the kitchen list's own order, then any kitchen
// id the list doesn't know (deleted since) by id, so "Other kitchens" reads the same everywhere.
function orderedKitchenIds(order: OrderDetail, kitchens: Kitchen[]): string[] {
  const present = new Set(order.items.map((item) => item.kitchenId));
  const known = kitchens.map((kitchen) => kitchen.id).filter((id) => present.has(id));
  const unknown = [...present].filter((id) => !known.includes(id)).sort();
  return [...known, ...unknown];
}

export function buildKitchenSlips(order: OrderDetail, kitchens: Kitchen[], options: KitchenSlipOptions = {}): KitchenSlip[] {
  const kitchenNameById = new Map(kitchens.map((kitchen) => [kitchen.id, kitchen.name]));
  const groups: SlipKitchenGroup[] = orderedKitchenIds(order, kitchens).map((kitchenId) => ({
    kitchenId,
    kitchenName: kitchenNameById.get(kitchenId) ?? "Kitchen",
    items: order.items.filter((item) => item.kitchenId === kitchenId).map((item) => slipItem(item, options.added)),
  }));

  const placeLine =
    order.type === "DINE_IN"
      ? `Table: ${order.diningArea ? `${order.diningArea.name}${order.diningArea.area ? ` (${order.diningArea.area})` : ""}` : "-"}`
      : isPickup(order)
        ? "PICKUP"
        : order.type === "TAKEAWAY"
          ? "TAKEAWAY"
          : "DELIVERY";
  const addedCount = [...(options.added?.values() ?? [])].reduce((sum, quantity) => sum + quantity, 0);

  const customer = getOrderCustomer(order);
  const customerLines =
    order.type === "DINE_IN"
      ? []
      : [
          customer.name ? (customer.phone ? `${customer.name} - ${customer.phone}` : customer.name) : null,
          ...customer.addressLines,
          customer.code ? `Order code: ${customer.code}` : null,
        ].filter((line): line is string => line !== null);

  return groups.map((own) => ({
    kitchenId: own.kitchenId,
    kitchenName: own.kitchenName,
    orderNumber: order.orderNumber,
    placeLine,
    typeLine: `Type: ${orderTypeLabel(order)}`,
    timeLine: `Time: ${formatTime(order.createdAt)}`,
    scheduledLine: order.scheduledFor ? `SCHEDULED FOR ${formatShopTime(order.scheduledFor)}` : null,
    customerLines,
    packLine: order.type === "DINE_IN" ? null : `PACK ALL ITEMS - ${isPickup(order) ? "PICKUP" : order.type === "TAKEAWAY" ? "TAKEAWAY" : "DELIVERY"}`,
    addedLine: addedCount > 0 ? `ITEMS ADDED: ${addedCount} (marked ADDED)` : null,
    own,
    others: groups.filter((group) => group.kitchenId !== own.kitchenId),
  }));
}

// Signature of an order line for matching "the same dish" across two versions of an order
// whose rows were re-created (an approved order-taker edit gives every item a new id).
function lineSignature(item: OrderItem): string {
  const addOnIds = (item.addOns ?? []).map((addOn) => addOn.addOnId).sort().join(",");
  return [item.menuItemId, item.variantId ?? "", addOnIds, item.notes ?? "", item.dealOrderLine?.dealName ?? ""].join("|");
}

// Which quantities in `after` weren't in `before`, matching by what the line is rather than
// by id: e.g. 1x Coke before and 2x Coke after marks that line "ADDED +1". Items that went
// away aren't marked (there's nothing on the slip to mark).
export function diffAddedQuantities(before: OrderDetail, after: OrderDetail): Map<string, number> {
  const remaining = new Map<string, number>();
  for (const item of before.items) {
    const key = lineSignature(item);
    remaining.set(key, (remaining.get(key) ?? 0) + item.quantity);
  }
  const added = new Map<string, number>();
  for (const item of after.items) {
    const key = lineSignature(item);
    const available = remaining.get(key) ?? 0;
    const matched = Math.min(available, item.quantity);
    remaining.set(key, available - matched);
    if (item.quantity - matched > 0) {
      added.set(item.id, item.quantity - matched);
    }
  }
  return added;
}

// Items whose ids are new in `after` — for adding items to an existing order, where existing
// rows keep their ids.
export function newItemQuantities(before: OrderDetail, after: OrderDetail): Map<string, number> {
  const beforeIds = new Set(before.items.map((item) => item.id));
  return new Map(after.items.filter((item) => !beforeIds.has(item.id)).map((item) => [item.id, item.quantity]));
}

// "?added=id:qty,id:qty" for the browser-print fallback, so it marks the same items.
export function encodeAdded(added: AddedQuantities): string {
  return [...added.entries()].map(([id, quantity]) => `${id}:${quantity}`).join(",");
}

export function decodeAdded(value: string | null): Map<string, number> {
  const added = new Map<string, number>();
  for (const part of (value ?? "").split(",")) {
    const [id, quantity] = part.split(":");
    const parsed = Number(quantity);
    if (id && Number.isInteger(parsed) && parsed > 0) {
      added.set(id, parsed);
    }
  }
  return added;
}
