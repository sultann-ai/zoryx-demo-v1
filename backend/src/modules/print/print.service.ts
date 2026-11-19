import { randomUUID } from "crypto";
import { getPrintAgentSocket } from "../../config/socket";
import type { PrintDoc } from "./printProtocol";
import { MAX_BLOCKS_PER_DOC, MAX_DOCS_PER_REQUEST, MAX_TEXT_LENGTH } from "./printProtocol";

export interface ValidatedPrintRequest {
  printerId: string;
  docs: PrintDoc[];
}

export type ValidationResult = { ok: true; value: ValidatedPrintRequest } | { ok: false; error: string };

type TableReceiptSnapshot = {
  shop: { nameEn: string | null; addressEn: string | null; phone: string | null };
  table: { name: string; area: string | null };
  issuedAt: string;
  orders: { orderNumber: number; guestName: string | null; lines: { name: string; size: string | null; addOns: string[]; quantity: number; lineTotal: string }[] }[];
  subtotal: string;
  discount: string;
  total: string;
  shares: { label: string; amount: string; method: "CASH" | "ONLINE" | null }[];
  isDemo: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTableReceiptSnapshot(value: unknown): value is TableReceiptSnapshot {
  if (!isRecord(value) || !isRecord(value.shop) || !isRecord(value.table) || !Array.isArray(value.orders) || !Array.isArray(value.shares)) {
    return false;
  }
  if (
    (value.shop.nameEn !== null && typeof value.shop.nameEn !== "string") ||
    (value.shop.addressEn !== null && typeof value.shop.addressEn !== "string") ||
    (value.shop.phone !== null && typeof value.shop.phone !== "string") ||
    typeof value.table.name !== "string" ||
    (value.table.area !== null && typeof value.table.area !== "string") ||
    typeof value.issuedAt !== "string" ||
    typeof value.subtotal !== "string" ||
    typeof value.discount !== "string" ||
    typeof value.total !== "string" ||
    typeof value.isDemo !== "boolean"
  ) {
    return false;
  }
  return value.orders.every((order) => {
    if (!isRecord(order) || typeof order.orderNumber !== "number" || (order.guestName !== null && typeof order.guestName !== "string") || !Array.isArray(order.lines)) {
      return false;
    }
    return order.lines.every(
      (line) =>
        isRecord(line) &&
        typeof line.name === "string" &&
        (line.size === null || typeof line.size === "string") &&
        Array.isArray(line.addOns) &&
        line.addOns.every((name) => typeof name === "string") &&
        Number.isInteger(line.quantity) &&
        typeof line.lineTotal === "string",
    );
  }) && value.shares.every(
    (share) =>
      isRecord(share) &&
      typeof share.label === "string" &&
      typeof share.amount === "string" &&
      (share.method === null || share.method === "CASH" || share.method === "ONLINE"),
  );
}

const receiptText = (value: string) => value.length > MAX_TEXT_LENGTH ? `${value.slice(0, MAX_TEXT_LENGTH - 1)}…` : value;

export function buildTableReceiptPrintDoc(receipt: unknown): PrintDoc {
  if (!isTableReceiptSnapshot(receipt)) {
    throw new Error("Stored table receipt snapshot is invalid");
  }
  const blocks: PrintDoc["blocks"] = [
    { t: "text", text: "Zoryx", align: "center", bold: true, size: 3 },
    ...(receipt.isDemo ? [{ t: "text" as const, text: "DEMO", align: "center" as const, bold: true }] : []),
    ...(receipt.shop.phone ? [{ t: "text" as const, text: receiptText(`Tel: ${receipt.shop.phone}`), align: "center" as const }] : []),
    ...(receipt.shop.addressEn ? [{ t: "text" as const, text: receiptText(receipt.shop.addressEn), align: "center" as const }] : []),
    { t: "rule" as const, style: "double" as const },
    { t: "text" as const, text: receiptText(receipt.table.area ? `${receipt.table.name} — ${receipt.table.area}` : receipt.table.name), align: "center" as const, bold: true },
    { t: "text" as const, text: new Date(receipt.issuedAt).toLocaleString(), align: "center" as const },
    { t: "rule" as const },
  ];
  for (const order of receipt.orders) {
    blocks.push({ t: "text", text: receiptText(`#${order.orderNumber}${order.guestName ? ` · ${order.guestName}` : ""}`), bold: true });
    for (const line of order.lines) {
      const label = `${line.quantity}x ${line.name}${line.size ? ` (${line.size})` : ""}${line.addOns.length ? ` ${line.addOns.map((name) => `+${name}`).join(" ")}` : ""}`;
      blocks.push({ t: "row", left: receiptText(label), right: receiptText(line.lineTotal) });
    }
  }
  blocks.push({ t: "rule" }, { t: "row", left: "Subtotal", right: receiptText(receipt.subtotal) });
  if (Number(receipt.discount) > 0) blocks.push({ t: "row", left: "Discount", right: `-${receiptText(receipt.discount)}` });
  blocks.push({ t: "rule", style: "double" }, { t: "row", left: "TOTAL", right: receiptText(receipt.total), bold: true }, { t: "rule", style: "double" });
  for (const share of receipt.shares) {
    blocks.push({ t: "row", left: receiptText(`${share.label}${share.method ? ` (${share.method === "CASH" ? "Cash" : "Online"})` : ""}`), right: receiptText(share.amount) });
  }
  blocks.push({ t: "text", text: "Payment Confirmed", align: "center", bold: true }, { t: "cut" });
  return { blocks };
}

const BLOCK_TYPES = ["text", "row", "rule", "feed", "cut", "drawer"] as const;

function isValidText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

function validateBlock(block: unknown, path: string): string | null {
  if (typeof block !== "object" || block === null) {
    return `${path} must be an object`;
  }
  const { t } = block as Record<string, unknown>;
  if (typeof t !== "string" || !BLOCK_TYPES.includes(t as (typeof BLOCK_TYPES)[number])) {
    return `${path}.t must be one of ${BLOCK_TYPES.join(", ")}`;
  }

  const b = block as Record<string, unknown>;
  switch (t) {
    case "text": {
      if (!isValidText(b.text)) {
        return `${path}.text must be a string of at most ${MAX_TEXT_LENGTH} characters`;
      }
      if (b.align !== undefined && !["left", "center", "right"].includes(b.align as string)) {
        return `${path}.align must be left, center, or right`;
      }
      if (b.bold !== undefined && typeof b.bold !== "boolean") {
        return `${path}.bold must be a boolean`;
      }
      if (b.size !== undefined && ![1, 2, 3].includes(b.size as number)) {
        return `${path}.size must be 1, 2, or 3`;
      }
      return null;
    }
    case "row": {
      if (!isValidText(b.left) || !isValidText(b.right)) {
        return `${path}.left and ${path}.right must be strings of at most ${MAX_TEXT_LENGTH} characters`;
      }
      if (b.bold !== undefined && typeof b.bold !== "boolean") {
        return `${path}.bold must be a boolean`;
      }
      return null;
    }
    case "rule": {
      if (b.style !== undefined && !["dash", "double"].includes(b.style as string)) {
        return `${path}.style must be dash or double`;
      }
      return null;
    }
    case "feed": {
      if (typeof b.lines !== "number" || !Number.isInteger(b.lines) || b.lines < 0) {
        return `${path}.lines must be a non-negative integer`;
      }
      return null;
    }
    case "cut":
    case "drawer":
      return null;
    default:
      return null;
  }
}

function validateDoc(doc: unknown, index: number): string | null {
  if (typeof doc !== "object" || doc === null) {
    return `docs[${index}] must be an object`;
  }
  const { blocks } = doc as Record<string, unknown>;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return `docs[${index}].blocks must be a non-empty array`;
  }
  if (blocks.length > MAX_BLOCKS_PER_DOC) {
    return `docs[${index}].blocks must have at most ${MAX_BLOCKS_PER_DOC} blocks`;
  }
  for (const [blockIndex, block] of blocks.entries()) {
    const error = validateBlock(block, `docs[${index}].blocks[${blockIndex}]`);
    if (error) {
      return error;
    }
  }
  return null;
}

export function validatePrintRequest(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "Request body must be an object" };
  }
  const { printerId, docs } = body as Record<string, unknown>;

  if (printerId !== undefined && (typeof printerId !== "string" || printerId.trim().length === 0)) {
    return { ok: false, error: "printerId must be a non-empty string" };
  }
  if (!Array.isArray(docs) || docs.length === 0) {
    return { ok: false, error: "docs must be a non-empty array" };
  }
  if (docs.length > MAX_DOCS_PER_REQUEST) {
    return { ok: false, error: `docs must have at most ${MAX_DOCS_PER_REQUEST} entries` };
  }
  for (const [index, doc] of docs.entries()) {
    const error = validateDoc(doc, index);
    if (error) {
      return { ok: false, error };
    }
  }

  return {
    ok: true,
    value: { printerId: (printerId as string | undefined) ?? "main", docs: docs as PrintDoc[] },
  };
}

export interface DispatchFailure {
  status: "offline" | "agent-error" | "timeout";
  message: string;
}

export interface DispatchResult {
  printed: number;
  failure?: DispatchFailure;
}

// Stringifies defensively — the agent authenticates via a shared secret, not a staff JWT, so
// its ack error isn't trusted to be a clean Error/string.
function describeAgentError(err: unknown): string {
  if (typeof err === "string") {
    return err;
  }
  if (err && typeof err === "object" && typeof (err as { message?: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Printer agent reported an error";
}

// Sequential, one doc at a time, stopping at the first failure — never attempts doc n+1 after
// doc n fails. See docs/PRINT_PROTOCOL.md for why this is a single try/catch with no `.ok`
// field: once `.timeout()` is used, Socket.io's ack callback is Node-style error-first.
export async function dispatchPrintJob(printerId: string, docs: PrintDoc[]): Promise<DispatchResult> {
  const socket = getPrintAgentSocket(printerId);
  if (!socket || !socket.connected) {
    return { printed: 0, failure: { status: "offline", message: "Printer agent is offline" } };
  }

  for (let i = 0; i < docs.length; i++) {
    const jobId = randomUUID();
    try {
      await socket.timeout(8000).emitWithAck("print:job", { jobId, printerId, doc: docs[i] as PrintDoc });
    } catch (err) {
      if (err instanceof Error && err.message === "operation has timed out") {
        return { printed: i, failure: { status: "timeout", message: "Printer did not respond" } };
      }
      return { printed: i, failure: { status: "agent-error", message: describeAgentError(err) } };
    }
  }

  return { printed: docs.length };
}
