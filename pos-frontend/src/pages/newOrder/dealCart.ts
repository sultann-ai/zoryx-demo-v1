import { normalizeLineNote } from "../../lib/lineNotes";

// A plain deal line is just a quantity, same as before. A customized deal line is
// always its own entry at quantity 1 (see the plan) — swapping/removing/adding items
// or changing the price never touches the plain counter for that same deal; add the
// deal tile again to get another standard one.
export type CustomDealItemOrigin = "standard" | "swapped" | "added";

export interface CustomDealItemAddOn {
  addOnId: string;
  name: string;
  price: string;
}

export interface CustomDealItem {
  // Local row identity only — never sent to the server.
  rowId: string;
  menuItemId: string;
  name: string;
  variantId: string | null;
  variantLabel: string | null;
  quantity: number;
  addOns: CustomDealItemAddOn[];
  origin: CustomDealItemOrigin;
}

export interface PlainDealLine {
  kind: "plain";
  dealId: string;
  quantity: number;
  // Already trimmed; "" for no note. Applies to every unit on this line, and is part of
  // its key (see plainDealKey).
  notes: string;
}

export interface CustomDealLine {
  kind: "custom";
  lineId: string;
  dealId: string;
  items: CustomDealItem[];
  finalPrice: string;
  reason: string;
  // Already trimmed; "" for no note.
  notes: string;
}

export type DealCartLine = PlainDealLine | CustomDealLine;

// Keyed by plainDealKey for a plain line (so tapping the same deal tile keeps bumping one
// counter, and a noted line stays separate from the un-noted one) or by a freshly
// generated lineId for a customized one (so a second customized instance of the same deal
// is its own line, never merged).
export type DealCart = Map<string, DealCartLine>;

// The un-noted plain line keeps the bare dealId as its key — what a deal tile tap bumps.
export function plainDealKey(dealId: string, notes: string): string {
  return notes === "" ? dealId : `${dealId}::note::${notes}`;
}

// A deal tile tap — always the plain, un-noted line for that deal.
export function incrementDealQuantity(cart: DealCart, dealId: string): DealCart {
  return incrementDealLine(cart, dealId, dealId);
}

// The cart line's own "+" — bumps exactly that plain line (noted or not). `dealId` is only
// used when the line doesn't exist yet (a tile tap on an empty cart).
export function incrementDealLine(cart: DealCart, key: string, dealId?: string): DealCart {
  const next = new Map(cart);
  const existing = next.get(key);
  if (existing && existing.kind !== "plain") {
    return next;
  }
  if (existing) {
    next.set(key, { ...existing, quantity: existing.quantity + 1 });
  } else if (dealId !== undefined) {
    next.set(key, { kind: "plain", dealId, quantity: 1, notes: "" });
  }
  return next;
}

export function decrementDealQuantity(cart: DealCart, key: string): DealCart {
  const next = new Map(cart);
  const existing = next.get(key);
  if (!existing || existing.kind !== "plain") {
    return next;
  }
  if (existing.quantity <= 1) {
    next.delete(key);
  } else {
    next.set(key, { ...existing, quantity: existing.quantity - 1 });
  }
  return next;
}

export function removeDealLine(cart: DealCart, key: string): DealCart {
  const next = new Map(cart);
  next.delete(key);
  return next;
}

// A plain line's note is part of its key, so it re-keys (merging into an identical noted
// line if there is one); a customized line is already its own instance and just updates.
export function setDealLineNotes(cart: DealCart, key: string, rawNotes: string): DealCart {
  const existing = cart.get(key);
  if (!existing) {
    return cart;
  }
  const notes = normalizeLineNote(rawNotes);
  const next = new Map(cart);
  if (existing.kind === "custom") {
    next.set(key, { ...existing, notes });
    return next;
  }
  const newKey = plainDealKey(existing.dealId, notes);
  if (newKey === key) {
    next.set(key, { ...existing, notes });
    return next;
  }
  next.delete(key);
  const target = next.get(newKey);
  const targetQuantity = target && target.kind === "plain" ? target.quantity : 0;
  next.set(newKey, { ...existing, notes, quantity: existing.quantity + targetQuantity });
  return next;
}

export interface DealCustomizationDraft {
  items: CustomDealItem[];
  finalPrice: string;
  reason: string;
}

// Opens a customization on a fresh unit of the deal (peeling one off a plain line,
// or starting from zero if this deal isn't in the cart yet) when `sourceKey` is a plain
// line's key, or edits an existing customized line in place when it's that line's own
// lineId. A unit peeled off a noted plain line keeps that note.
export function applyDealCustomization(
  cart: DealCart,
  sourceKey: string,
  dealId: string,
  draft: DealCustomizationDraft,
): DealCart {
  const next = new Map(cart);
  const source = next.get(sourceKey);
  if (source && source.kind === "custom") {
    next.set(sourceKey, { ...source, items: draft.items, finalPrice: draft.finalPrice, reason: draft.reason });
    return next;
  }
  if (source && source.kind === "plain") {
    if (source.quantity <= 1) {
      next.delete(sourceKey);
    } else {
      next.set(sourceKey, { ...source, quantity: source.quantity - 1 });
    }
  }
  const lineId = `custom-${dealId}-${crypto.randomUUID()}`;
  next.set(lineId, {
    kind: "custom",
    lineId,
    dealId,
    items: draft.items,
    finalPrice: draft.finalPrice,
    reason: draft.reason,
    notes: source?.notes ?? "",
  });
  return next;
}

// Removes the customization, folding the unit back into the plain line for its deal with
// the same note.
export function resetDealCustomization(cart: DealCart, lineId: string): DealCart {
  const next = new Map(cart);
  const line = next.get(lineId);
  if (!line || line.kind !== "custom") {
    return next;
  }
  next.delete(lineId);
  const key = plainDealKey(line.dealId, line.notes);
  const existing = next.get(key);
  if (existing && existing.kind === "plain") {
    next.set(key, { ...existing, quantity: existing.quantity + 1 });
  } else {
    next.set(key, { kind: "plain", dealId: line.dealId, quantity: 1, notes: line.notes });
  }
  return next;
}

export function dealLineTotal(line: DealCartLine, dealById: Map<string, { price: string }>): number {
  if (line.kind === "plain") {
    const deal = dealById.get(line.dealId);
    return (deal ? Number(deal.price) : 0) * line.quantity;
  }
  return Number(line.finalPrice) || 0;
}

export function dealCartTotal(cart: DealCart, dealById: Map<string, { price: string }>): number {
  let total = 0;
  for (const line of cart.values()) {
    total += dealLineTotal(line, dealById);
  }
  return total;
}

export interface DealPayloadEntry {
  dealId: string;
  quantity: number;
  notes?: string;
  customization?: {
    items: { menuItemId: string; quantity: number; variantId?: string; addOnIds?: string[] }[];
    finalPrice: number;
    reason?: string;
  };
}

export function toDealPayload(cart: DealCart): DealPayloadEntry[] {
  return Array.from(cart.values()).map((line) => {
    const notes = line.notes !== "" ? { notes: line.notes } : {};
    if (line.kind === "plain") {
      return { dealId: line.dealId, quantity: line.quantity, ...notes };
    }
    const reason = line.reason.trim();
    return {
      dealId: line.dealId,
      quantity: 1,
      ...notes,
      customization: {
        items: line.items.map((item) => ({
          menuItemId: item.menuItemId,
          quantity: item.quantity,
          ...(item.variantId !== null ? { variantId: item.variantId } : {}),
          ...(item.addOns.length > 0 ? { addOnIds: item.addOns.map((addOn) => addOn.addOnId) } : {}),
        })),
        finalPrice: Number(line.finalPrice),
        ...(reason !== "" ? { reason } : {}),
      },
    };
  });
}
