import type { TableBillShare } from "../../api/tables";
import type { StatusTone } from "../../components/ui";

// Input checks for the bill panel's forms — only to save a refused try. The server computes and
// checks every amount itself (Decimal, Σ shares = total); these never decide what is charged.

const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;

// A typed amount in paisa (integer), or null when it isn't a plain amount with at most 2 decimals.
export function toPaisa(text: string): number | null {
  const trimmed = text.trim();
  if (!MONEY_PATTERN.test(trimmed)) {
    return null;
  }
  const [rupees, fraction = ""] = trimmed.split(".");
  return Number(rupees) * 100 + Number(fraction.padEnd(2, "0"));
}

export function paisaToString(paisa: number): string {
  const sign = paisa < 0 ? "-" : "";
  const abs = Math.abs(paisa);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export interface CustomSplitCheck {
  // Σ of the typed amounts, in paisa (null while one of them isn't a valid amount).
  sumPaisa: number | null;
  // What still has to be placed (total − Σ); 0 when it adds up.
  leftPaisa: number | null;
  error: string | null;
}

// CUSTOM split rules (spec §7.4): 1–20 shares, each ≥ 0 with at most 2 decimals, every share but
// the first in whole rupees, and Σ exactly the bill total.
export function checkCustomSplit(amounts: string[], totalPaisa: number): CustomSplitCheck {
  if (amounts.length < 1 || amounts.length > 20) {
    return { sumPaisa: null, leftPaisa: null, error: "Use 1 to 20 shares." };
  }
  let sum = 0;
  for (const [index, text] of amounts.entries()) {
    const paisa = toPaisa(text);
    if (paisa === null) {
      return { sumPaisa: null, leftPaisa: null, error: `Share ${index + 1}: enter an amount like 1250 or 1250.50.` };
    }
    if (index > 0 && paisa % 100 !== 0) {
      return { sumPaisa: null, leftPaisa: null, error: `Share ${index + 1} must be whole rupees — only share 1 may carry paisa.` };
    }
    sum += paisa;
  }
  return { sumPaisa: sum, leftPaisa: totalPaisa - sum, error: null };
}

// Equal amounts that add up to the total the way the server splits them (share 1 takes the remainder),
// to prefill the Custom editor.
export function equalAmounts(totalPaisa: number, parts: number): string[] {
  const base = Math.floor(totalPaisa / 100 / parts) * 100;
  return Array.from({ length: parts }, (_, index) => paisaToString(index === 0 ? totalPaisa - base * (parts - 1) : base));
}

// How a share's state reads: dot + word, never colour alone.
export function shareStatusMeta(share: TableBillShare): { label: string; tone: StatusTone } {
  switch (share.status) {
    case "VERIFIED":
      return { label: share.method === "ONLINE" ? "Paid online" : "Paid cash", tone: "success" };
    case "PROOF_SUBMITTED":
      return { label: "Proof to check", tone: "warning" };
    case "REJECTED":
      return { label: "Proof rejected", tone: "danger" };
    case "VOID":
      return { label: "Cancelled", tone: "neutral" };
    case "UNPAID":
    default:
      return share.cashRequested ? { label: "Wants to pay cash", tone: "warning" } : { label: "Unpaid", tone: "neutral" };
  }
}
