import type { TableReceiptSnapshot } from "../api/tables";
import { shop } from "../config/shop";
import { formatDateTime, formatMoney } from "../lib/format";
import type { Block, PrintDoc } from "./printProtocol";
import { MAX_BLOCKS_PER_DOC, MAX_TEXT_LENGTH } from "./printProtocol";

// The whole table's receipt (docs/TABLE_QR_SPEC.md §7.6), printed from the bill panel through the
// print agent. Built from the receipt snapshot the server made when the bill was paid — never from
// the live orders — so a reprint always matches what the guests' phones show.

const PAYMENT_LABEL: Record<"CASH" | "ONLINE", string> = { CASH: "Cash", ONLINE: "Online" };

const clip = (text: string) => (text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH - 1)}…` : text);

function lineLabel(line: TableReceiptSnapshot["orders"][number]["lines"][number]): string {
  let label = `${line.quantity}x ${line.name}`;
  if (line.size) {
    label += ` (${line.size})`;
  }
  if (line.addOns.length > 0) {
    label += ` ${line.addOns.map((name) => `+${name}`).join(" ")}`;
  }
  return clip(label);
}

function header(receipt: TableReceiptSnapshot): Block[] {
  const blocks: Block[] = [{ t: "text", text: shop.wordmark, align: "center", bold: true, size: 3 }];
  if (receipt.isDemo) {
    blocks.push({ t: "text", text: "DEMO", align: "center", bold: true });
  }
  const phone = receipt.shop.phone ?? shop.phone;
  const address = receipt.shop.addressEn ?? shop.address;
  if (phone) {
    blocks.push({ t: "text", text: `Tel: ${phone}`, align: "center" });
  }
  if (address) {
    blocks.push({ t: "text", text: clip(address), align: "center" });
  }
  blocks.push({ t: "rule", style: "double" });
  const table = receipt.table.area ? `${receipt.table.name} — ${receipt.table.area}` : receipt.table.name;
  blocks.push({ t: "text", text: clip(table), align: "center", bold: true, size: 2 });
  blocks.push({ t: "text", text: formatDateTime(receipt.issuedAt), align: "center" });
  blocks.push({ t: "rule" });
  return blocks;
}

// Every line of every round, under "#14 · Ali".
function detailedLines(receipt: TableReceiptSnapshot): Block[] {
  return receipt.orders.flatMap((order): Block[] => [
    { t: "text", text: clip(`#${order.orderNumber}${order.guestName ? ` · ${order.guestName}` : ""}`), bold: true },
    ...order.lines.map((line): Block => ({ t: "row", left: lineLabel(line), right: formatMoney(line.lineTotal) })),
  ]);
}

// A very long table would pass the printer's block limit: then one row per round instead.
function roundTotals(receipt: TableReceiptSnapshot): Block[] {
  return receipt.orders.map((order): Block => {
    const total = order.lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);
    return { t: "row", left: clip(`#${order.orderNumber}${order.guestName ? ` · ${order.guestName}` : ""}`), right: formatMoney(total) };
  });
}

function footer(receipt: TableReceiptSnapshot): Block[] {
  const blocks: Block[] = [{ t: "rule" }, { t: "row", left: "Subtotal", right: formatMoney(receipt.subtotal) }];
  if (Number(receipt.discount) > 0) {
    blocks.push({ t: "row", left: "Discount", right: `-${formatMoney(receipt.discount)}` });
  }
  blocks.push({ t: "rule", style: "double" });
  blocks.push({ t: "row", left: "TOTAL", right: formatMoney(receipt.total), bold: true });
  blocks.push({ t: "rule", style: "double" });
  if (receipt.shares.length > 0) {
    blocks.push({ t: "text", text: "Paid", bold: true });
    for (const share of receipt.shares) {
      const method = share.method ? ` (${PAYMENT_LABEL[share.method]})` : "";
      blocks.push({ t: "row", left: clip(`${share.label}${method}`), right: formatMoney(share.amount) });
    }
  }
  blocks.push({ t: "text", text: "Payment Confirmed", align: "center", bold: true, size: 2 });
  blocks.push({ t: "feed", lines: 1 });
  blocks.push({ t: "text", text: "Thank you for visiting!", align: "center", bold: true });
  blocks.push({ t: "text", text: shop.footerUrl, align: "center" });
  blocks.push({ t: "feed", lines: 2 });
  blocks.push({ t: "cut" });
  return blocks;
}

export function buildTableReceiptDoc(receipt: TableReceiptSnapshot): PrintDoc {
  const top = header(receipt);
  const bottom = footer(receipt);
  const detailed = detailedLines(receipt);
  const middle = top.length + detailed.length + bottom.length <= MAX_BLOCKS_PER_DOC ? detailed : roundTotals(receipt);
  return { blocks: [...top, ...middle, ...bottom] };
}
