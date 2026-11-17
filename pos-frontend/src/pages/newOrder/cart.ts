import { normalizeLineNote } from "../../lib/lineNotes";

// A chosen add-on on a cart line, snapshotted the same shape the backend stores on
// the eventual OrderItem (addOnId/name/price) so the submit payload and the receipt
// preview read from the same data without re-deriving anything.
export interface CartAddOn {
  addOnId: string;
  name: string;
  price: string;
}

export interface CartEntry {
  menuItemId: string;
  // Both null for a plain (non-sized) item.
  variantId: string | null;
  variantLabel: string | null;
  quantity: number;
  // Already trimmed (see normalizeLineNote); "" for no note. Part of the line's key.
  notes: string;
  addOns: CartAddOn[];
  // Set only for an open-price item — the price the cashier typed, as a decimal
  // string. Null for every other line (its price is always re-derived from the menu).
  customPrice: string | null;
}

// Keyed by menuItemId + variantId + the sorted set of chosen addOnIds + the open price (if
// any) + the note, so lines only merge when all of those match: "Burger" and "Burger — no
// onion" are two lines, as are "Chicken Fajita · Small" and "Chicken Fajita · Small + Extra
// Cheese", or two cakes at different prices.
export type Cart = Map<string, CartEntry>;

export function cartKey(
  menuItemId: string,
  variantId?: string | null,
  addOnIds?: string[],
  customPrice?: string | null,
  notes?: string,
): string {
  const addOnsPart = [...(addOnIds ?? [])].sort().join(",");
  return `${menuItemId}::${variantId ?? ""}::${addOnsPart}::${customPrice ?? ""}::${notes ?? ""}`;
}

function entryKey(entry: CartEntry): string {
  return cartKey(
    entry.menuItemId,
    entry.variantId,
    entry.addOns.map((addOn) => addOn.addOnId),
    entry.customPrice,
    entry.notes,
  );
}

// Moves an edited entry to whatever key its new contents produce — merging into a line
// that already has that exact key (same rule as tapping the same tile twice) — or edits
// in place when the key didn't change. Shared by every edit that touches the key.
function rekeyEntry(cart: Cart, key: string, updated: CartEntry): Cart {
  const newKey = entryKey(updated);
  const next = new Map(cart);
  if (newKey === key) {
    next.set(key, updated);
    return next;
  }
  next.delete(key);
  const target = next.get(newKey);
  next.set(newKey, { ...updated, quantity: updated.quantity + (target?.quantity ?? 0) });
  return next;
}

// Add-ons and notes are never set at tap-time (see SizePickerModal) — a tapped tile always
// adds/bumps the plain (no add-on, no note) line for that item+size. Both are set
// afterward on the cart line itself (setLineAddOns/setItemNotes), which re-key as needed.
export function incrementQuantity(
  cart: Cart,
  menuItemId: string,
  variantId?: string,
  variantLabel?: string,
): Cart {
  const key = cartKey(menuItemId, variantId ?? null);
  const next = new Map(cart);
  const existing = next.get(key);
  next.set(key, {
    menuItemId,
    variantId: variantId ?? null,
    variantLabel: variantLabel ?? null,
    quantity: (existing?.quantity ?? 0) + 1,
    notes: "",
    addOns: [],
    customPrice: null,
  });
  return next;
}

// The cart line's own "+" — bumps exactly that line, whatever its add-ons/note/price.
export function incrementLine(cart: Cart, key: string): Cart {
  const existing = cart.get(key);
  if (!existing) {
    return cart;
  }
  const next = new Map(cart);
  next.set(key, { ...existing, quantity: existing.quantity + 1 });
  return next;
}

// Adds (or merges into) an open-price line. Two taps of the same item only merge when
// the price and note are also identical — see cartKey's comment.
export function addOpenPriceItem(cart: Cart, menuItemId: string, customPrice: string, rawNotes: string): Cart {
  const notes = normalizeLineNote(rawNotes);
  const key = cartKey(menuItemId, null, undefined, customPrice, notes);
  const next = new Map(cart);
  const existing = next.get(key);
  next.set(key, {
    menuItemId,
    variantId: null,
    variantLabel: null,
    quantity: (existing?.quantity ?? 0) + 1,
    notes,
    addOns: [],
    customPrice,
  });
  return next;
}

// Re-prices/re-notes an existing open-price line (the pencil → dialog → Save flow).
export function setCustomPrice(cart: Cart, key: string, customPrice: string, notes: string): Cart {
  const existing = cart.get(key);
  if (!existing) {
    return cart;
  }
  return rekeyEntry(cart, key, { ...existing, customPrice, notes: normalizeLineNote(notes) });
}

export function decrementQuantity(cart: Cart, key: string): Cart {
  const next = new Map(cart);
  const existing = next.get(key);
  if (!existing) {
    return next;
  }
  if (existing.quantity <= 1) {
    next.delete(key);
  } else {
    next.set(key, { ...existing, quantity: existing.quantity - 1 });
  }
  return next;
}

export function removeItem(cart: Cart, key: string): Cart {
  const next = new Map(cart);
  next.delete(key);
  return next;
}

// The note is part of the line's key, so this re-keys (and may merge into an identical
// line). Called once the note is committed, not per keystroke — see CartPanel.
export function setItemNotes(cart: Cart, key: string, notes: string): Cart {
  const existing = cart.get(key);
  if (!existing) {
    return cart;
  }
  return rekeyEntry(cart, key, { ...existing, notes: normalizeLineNote(notes) });
}

// Toggling add-ons changes a line's identity (its key embeds the add-on set) — re-keys the
// same way, merging with an identical line if one exists.
export function setLineAddOns(cart: Cart, key: string, addOns: CartAddOn[]): Cart {
  const existing = cart.get(key);
  if (!existing) {
    return cart;
  }
  return rekeyEntry(cart, key, { ...existing, addOns });
}

// The key an entry will have after setLineAddOns — lets the cart panel keep the add-on
// picker attached to a line that just moved.
export function cartKeyFor(entry: CartEntry, changes: Partial<Pick<CartEntry, "addOns" | "notes">>): string {
  return entryKey({ ...entry, ...changes });
}

export interface CartPriceableMenuItem {
  price: string | null;
  variants: { id: string; price: string | null }[];
}

// Resolves a single entry's unit price: its chosen variant's price if sized (else the
// item's own standalone price), plus the sum of its chosen add-ons' prices. Returns
// null if the base price can't be resolved (shouldn't happen for anything actually
// addable to the cart — see MenuTileGrid's sellableAlone/price filtering — but callers
// treat null as "can't price this" rather than crashing).
export function cartEntryPrice(entry: CartEntry, menuItemById: Map<string, CartPriceableMenuItem>): number | null {
  if (entry.customPrice !== null) {
    return Number(entry.customPrice);
  }
  const item = menuItemById.get(entry.menuItemId);
  if (!item) {
    return null;
  }
  let basePrice: number | null;
  if (entry.variantId !== null) {
    const variant = item.variants.find((candidate) => candidate.id === entry.variantId);
    basePrice = variant && variant.price !== null ? Number(variant.price) : null;
  } else {
    basePrice = item.price !== null ? Number(item.price) : null;
  }
  if (basePrice === null) {
    return null;
  }
  const addOnsTotal = entry.addOns.reduce((sum, addOn) => sum + Number(addOn.price), 0);
  return basePrice + addOnsTotal;
}

export function cartTotal(cart: Cart, menuItemById: Map<string, CartPriceableMenuItem>): number {
  let total = 0;
  for (const entry of cart.values()) {
    const price = cartEntryPrice(entry, menuItemById);
    if (price !== null) {
      total += price * entry.quantity;
    }
  }
  return total;
}
