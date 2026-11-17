import type { Deal } from "../../api/deals";
import type { CustomDealItem } from "./dealCart";

// Kept separate from dealCart.ts so this pure logic (no React, no id generation beyond
// what the caller injects) can be unit-tested on its own.

export function standardItemsFromDeal(deal: Deal): CustomDealItem[] {
  return deal.items.map((dealItem) => ({
    rowId: crypto.randomUUID(),
    menuItemId: dealItem.menuItemId,
    name: dealItem.menuItem.name,
    variantId: null,
    variantLabel: null,
    quantity: dealItem.quantity,
    addOns: [],
    origin: "standard" as const,
  }));
}

export interface ExtrasPriceableMenuItem {
  price: string | null;
  variants: { id: string; price: string | null }[];
}

function resolveUnitPrice(
  item: ExtrasPriceableMenuItem | undefined,
  variantId: string | null,
): number | null {
  if (!item) {
    return null;
  }
  if (variantId !== null) {
    const variant = item.variants.find((candidate) => candidate.id === variantId);
    return variant && variant.price !== null ? Number(variant.price) : null;
  }
  return item.price !== null ? Number(item.price) : null;
}

// Extras = every row's add-on total (add-ons are always an addition to the deal,
// whatever the row's origin) plus the regular price of rows added via "Add item".
// Changing or removing a standard row changes nothing here by itself — see the plan's
// judgment call 3.
export function computeDealExtras(
  items: CustomDealItem[],
  menuItemById: Map<string, ExtrasPriceableMenuItem>,
): number {
  let extras = 0;
  for (const item of items) {
    const addOnsTotal = item.addOns.reduce((sum, addOn) => sum + Number(addOn.price), 0);
    extras += addOnsTotal * item.quantity;
    if (item.origin === "added") {
      const basePrice = resolveUnitPrice(menuItemById.get(item.menuItemId), item.variantId);
      if (basePrice !== null) {
        extras += basePrice * item.quantity;
      }
    }
  }
  return extras;
}
