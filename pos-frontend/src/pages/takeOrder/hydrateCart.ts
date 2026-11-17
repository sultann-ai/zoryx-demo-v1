import type { OrderDetail } from "../../api/orders";
import type { Cart } from "../newOrder/cart";
import { cartKey } from "../newOrder/cart";
import type { CustomDealItem, DealCart, DealCartLine } from "../newOrder/dealCart";
import { plainDealKey } from "../newOrder/dealCart";

// The reverse of toDealPayload/the cart-entry builders — rebuilds a Cart/DealCart
// straight from an existing order's items/dealLines, for the edit flows: TakeOrderPage
// re-opened against an order it already has (PUT /submission or a change request), and
// NewOrderPage's "Edit items" for a SCHEDULED order (PUT /:id/scheduled-items).
export function hydrateCart(order: OrderDetail): { cart: Cart; dealCart: DealCart } {
  const cart: Cart = new Map();
  for (const item of order.items) {
    if (item.dealOrderLineId !== null) {
      continue;
    }
    const addOnIds = (item.addOns ?? []).map((addOn) => addOn.addOnId);
    const customPrice = item.isCustomPrice ? item.unitPrice : null;
    const notes = item.notes ?? "";
    const key = cartKey(item.menuItemId, item.variantId, addOnIds, customPrice, notes);
    const existing = cart.get(key);
    cart.set(key, {
      menuItemId: item.menuItemId,
      variantId: item.variantId,
      variantLabel: item.variantLabel,
      quantity: (existing?.quantity ?? 0) + item.quantity,
      notes,
      addOns: (item.addOns ?? []).map((addOn) => ({ addOnId: addOn.addOnId, name: addOn.name, price: addOn.price })),
      customPrice,
    });
  }

  const dealCart: DealCart = new Map();
  for (const line of order.dealLines) {
    if (line.dealId === null) {
      continue;
    }
    const notes = line.notes ?? "";
    if (!line.customization) {
      const key = plainDealKey(line.dealId, notes);
      const existing = dealCart.get(key);
      const quantity = existing && existing.kind === "plain" ? existing.quantity : 0;
      dealCart.set(key, { kind: "plain", dealId: line.dealId, quantity: quantity + line.quantity, notes });
      continue;
    }
    // Rebuilt from the deal line's own exploded OrderItems, which keep the real variantId and
    // add-on ids — the customization snapshot is for reading only (no ids), and resending its
    // add-ons with an empty id is rejected by the server. The snapshot is the fallback only
    // for a line with no exploded rows.
    const exploded = order.items.filter((item) => item.dealOrderLineId === line.id);
    const items: CustomDealItem[] =
      exploded.length > 0
        ? exploded.map((item) => ({
            rowId: crypto.randomUUID(),
            menuItemId: item.menuItemId,
            name: item.menuItem.name,
            variantId: item.variantId,
            variantLabel: item.variantLabel,
            quantity: item.quantity,
            addOns: (item.addOns ?? []).map((addOn) => ({ addOnId: addOn.addOnId, name: addOn.name, price: addOn.price })),
            origin: "standard" as const,
          }))
        : line.customization.items.map((item) => ({
            rowId: crypto.randomUUID(),
            menuItemId: item.menuItemId,
            name: item.name,
            variantId: null,
            variantLabel: item.variantLabel ?? null,
            quantity: item.quantity,
            addOns: [],
            origin: "standard" as const,
          }));
    const lineId = `custom-${line.dealId}-${crypto.randomUUID()}`;
    const customLine: DealCartLine = {
      kind: "custom",
      lineId,
      dealId: line.dealId,
      items,
      finalPrice: line.unitPrice,
      reason: line.customization.reason ?? "",
      notes,
    };
    dealCart.set(lineId, customLine);
  }

  return { cart, dealCart };
}
