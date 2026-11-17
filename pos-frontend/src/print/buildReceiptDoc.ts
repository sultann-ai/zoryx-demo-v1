import type { OrderDetail, OrderItem } from "../api/orders";
import { shop } from "../config/shop";
import { formatDateTime, formatMoney } from "../lib/format";
import { getOrderCustomer } from "../lib/orderCustomer";
import { formatShopTime } from "../lib/shopTime";
import { ORDER_TYPE_LABEL, PAYMENT_METHOD_LABEL } from "../lib/enumLabels";
import { isPickup } from "../lib/orderCustomer";
import type { Block, PrintDoc } from "./printProtocol";

// Each note on its own indented line under the row it belongs to.
function noteBlocks(notes: (string | null)[], indent: string): Block[] {
  return notes
    .filter((note): note is string => Boolean(note))
    .map((note): Block => ({ t: "text", text: `${indent}Note: ${note}` }));
}

function itemLine(item: OrderItem): string {
  let line = `${item.quantity}x ${item.menuItem.name}`;
  if (item.variantLabel) {
    line += ` (${item.variantLabel})`;
  }
  if (item.addOns && item.addOns.length > 0) {
    line += ` ${item.addOns.map((addOn) => `+${addOn.name}`).join(" ")}`;
  }
  return line;
}

// The customer-facing receipt — shop branding, full item detail, visually set apart with
// rules and bold/centered emphasis. Kitchen tickets (buildKitchenTicketDocs.ts) deliberately
// stay bare and short to save paper; this one doesn't need to.
//
// Printed twice in the order's life, from OrderDetailPage: once right after the order is
// placed (the "table receipt", paymentConfirmed left false — nothing's been paid yet) and
// once at payment confirmation (the "final receipt", paymentConfirmed: true). Same document
// otherwise — only the confirmation line differs.
export function buildReceiptDoc(order: OrderDetail, options?: { paymentConfirmed?: boolean }): PrintDoc {
  const blocks: Block[] = [];

  // One-color logo (the print protocol has no image block yet, so the wordmark is printed as text),
  // then "DEMO" as plain text — the black logo has no pill.
  blocks.push({ t: "text", text: shop.wordmark, align: "center", bold: true, size: 3 });
  blocks.push({ t: "text", text: "DEMO", align: "center", bold: true });
  if (shop.phone) {
    blocks.push({ t: "text", text: `Tel: ${shop.phone}`, align: "center" });
  }
  if (shop.address) {
    blocks.push({ t: "text", text: shop.address, align: "center" });
  }
  blocks.push({ t: "rule", style: "double" });

  blocks.push({ t: "text", text: `Order #${order.orderNumber}`, align: "center", bold: true, size: 2 });
  blocks.push({ t: "text", text: formatDateTime(order.createdAt), align: "center" });

  // An online pickup order is printed as PICKUP (name, phone and code below; no address, no delivery fee).
  let typeLine = isPickup(order) ? "PICKUP" : ORDER_TYPE_LABEL[order.type];
  if (order.diningArea) {
    typeLine += ` — ${order.diningArea.name}`;
  }
  blocks.push({ t: "text", text: typeLine, align: "center" });

  // Who it's for and where it goes — from the Customer account when there is one, otherwise from the
  // order itself (guest checkout). The address is stored on several lines; each is its own block so
  // the printer wraps it cleanly, and the order code is what the customer quotes over the phone.
  const customer = getOrderCustomer(order);
  if (customer.name) {
    blocks.push({ t: "text", text: customer.phone ? `${customer.name} - ${customer.phone}` : customer.name, align: "center" });
  }
  for (const line of customer.addressLines) {
    blocks.push({ t: "text", text: line, align: "center" });
  }
  if (customer.code) {
    blocks.push({ t: "text", text: `Order code: ${customer.code}`, align: "center", bold: true });
  }
  if (order.scheduledFor) {
    blocks.push({ t: "text", text: `Scheduled for ${formatShopTime(order.scheduledFor)}`, align: "center", bold: true });
  }
  blocks.push({ t: "rule" });

  // Composed items of a deal are 0-priced OrderItem rows (see dealOrderLineId) — shown as a
  // smaller indented sub-line under the deal's own priced row, never as their own row.
  const directItems = order.items.filter((item) => item.dealOrderLineId === null);
  const itemsByDealLine = new Map<string, OrderItem[]>();
  for (const item of order.items) {
    if (item.dealOrderLineId === null) {
      continue;
    }
    const bucket = itemsByDealLine.get(item.dealOrderLineId);
    if (bucket) {
      bucket.push(item);
    } else {
      itemsByDealLine.set(item.dealOrderLineId, [item]);
    }
  }

  for (const item of directItems) {
    blocks.push({ t: "row", left: itemLine(item), right: formatMoney(item.subtotal) });
    blocks.push(...noteBlocks([item.notes], "  "));
  }
  for (const line of order.dealLines) {
    const dealLabel = line.customization ? `${line.quantity}x ${line.dealName} (customized)` : `${line.quantity}x ${line.dealName}`;
    blocks.push({ t: "row", left: dealLabel, right: formatMoney(line.subtotal), bold: true });
    blocks.push(...noteBlocks([line.notes], "  "));
    for (const composedItem of itemsByDealLine.get(line.id) ?? []) {
      blocks.push({ t: "text", text: `  - ${itemLine(composedItem)}` });
      blocks.push(...noteBlocks([composedItem.notes], "    "));
    }
  }

  blocks.push({ t: "rule" });
  if (Number(order.discount) > 0) {
    blocks.push({ t: "row", left: "Discount", right: `-${formatMoney(order.discount)}` });
  }
  if (customer.deliveryFee > 0) {
    blocks.push({ t: "row", left: "Delivery fee", right: formatMoney(order.deliveryFee) });
  }
  blocks.push({ t: "rule", style: "double" });
  blocks.push({ t: "row", left: "TOTAL", right: formatMoney(order.totalAmount), bold: true });
  blocks.push({ t: "rule", style: "double" });

  blocks.push({ t: "text", text: `Payment: ${PAYMENT_METHOD_LABEL[order.paymentMethod]}`, align: "center" });
  if (options?.paymentConfirmed) {
    blocks.push({ t: "text", text: "Payment Confirmed", align: "center", bold: true, size: 2 });
  }
  blocks.push({ t: "feed", lines: 1 });
  blocks.push({ t: "text", text: "Thank you for visiting!", align: "center", bold: true });
  blocks.push({ t: "text", text: shop.footerUrl, align: "center" });
  blocks.push({ t: "feed", lines: 2 });
  blocks.push({ t: "cut" });

  return { blocks };
}
