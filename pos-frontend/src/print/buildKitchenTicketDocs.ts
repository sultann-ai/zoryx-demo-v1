import type { Kitchen } from "../api/kitchens";
import type { OrderDetail } from "../api/orders";
import type { KitchenSlip, KitchenSlipOptions, SlipItem } from "./kitchenSlip";
import { buildKitchenSlips } from "./kitchenSlip";
import type { Block, PrintDoc } from "./printProtocol";
import { MAX_TEXT_LENGTH } from "./printProtocol";

// At the print agent's default 48-character width (80mm paper), size 3 (double width) fits
// 24 characters — the "THIS KITCHEN" header uses it only when it fits on one line.
const QUAD_SIZE_MAX_CHARS = 24;

// A block over MAX_TEXT_LENGTH would get the whole print job rejected — never let one long
// name or note cost a kitchen its slip.
function clamp(text: string): string {
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 3)}...` : text;
}

function text(value: string, style: { bold?: boolean; size?: 1 | 2 | 3; align?: "left" | "center" } = {}): Block {
  return { t: "text", text: clamp(value), ...style };
}

// One item: "[ADDED] 2x Zinger Burger (Large) (Family Deal)", then indented add-on and note
// lines. The print agent word-wraps every line to the paper and keeps the indent on the
// continuation lines, so a long name or note never runs off the edge.
function itemBlocks(item: SlipItem, style: { bold: boolean; size: 1 | 2 }, indent: string): Block[] {
  const title = [item.addedMark ? `[${item.addedMark}]` : null, item.title, item.dealTag].filter(Boolean).join(" ");
  const blocks: Block[] = [text(`${indent}${title}`, style)];
  if (item.addOns) {
    blocks.push(text(`${indent}   ${item.addOns}`, style));
  }
  for (const note of item.notes) {
    blocks.push(text(`${indent}   NOTE: ${note}`, style));
  }
  return blocks;
}

function slipDoc(slip: KitchenSlip): PrintDoc {
  const header = `THIS KITCHEN: ${slip.kitchenName.toUpperCase()}`;
  const blocks: Block[] = [
    text(header, { bold: true, size: header.length <= QUAD_SIZE_MAX_CHARS ? 3 : 2, align: "center" }),
    { t: "rule", style: "double" },
    text(`Order #${slip.orderNumber}`, { bold: true, size: 2 }),
    text(slip.placeLine, { bold: true, size: 2 }),
    text(slip.typeLine),
    text(slip.timeLine),
  ];
  if (slip.scheduledLine) {
    blocks.push(text(slip.scheduledLine, { bold: true }));
  }
  for (const line of slip.customerLines) {
    blocks.push(text(line));
  }
  if (slip.packLine) {
    blocks.push(text(slip.packLine, { bold: true, size: 2 }));
  }
  if (slip.addedLine) {
    blocks.push(text(slip.addedLine, { bold: true, size: 2 }));
  }
  blocks.push({ t: "rule", style: "double" });

  // This kitchen's group: bold, double height.
  blocks.push(text(`${slip.own.kitchenName} (this kitchen)`, { bold: true, size: 2 }));
  for (const item of slip.own.items) {
    blocks.push(...itemBlocks(item, { bold: true, size: 2 }, ""));
  }

  // Everyone else's: normal size, under "Other kitchens", one labelled group per kitchen.
  if (slip.others.length > 0) {
    blocks.push({ t: "rule" });
    blocks.push(text("Other kitchens", { bold: true }));
    for (const group of slip.others) {
      blocks.push(text(`${group.kitchenName}:`, { bold: true }));
      for (const item of group.items) {
        blocks.push(...itemBlocks(item, { bold: false, size: 1 }, "  "));
      }
    }
  }

  blocks.push({ t: "cut" });
  return { blocks };
}

// One slip per kitchen that has at least one item on the order, each listing every item —
// see kitchenSlip.ts for the layout's rules. Still deliberately bare otherwise (no shop
// branding, no footer) to save paper; the customer receipt (buildReceiptDoc.ts) is where the
// branding belongs. `options.added` marks the items a print was made for ("ADDED").
export function buildKitchenTicketDocs(order: OrderDetail, kitchens: Kitchen[], options: KitchenSlipOptions = {}): PrintDoc[] {
  return buildKitchenSlips(order, kitchens, options).map(slipDoc);
}
