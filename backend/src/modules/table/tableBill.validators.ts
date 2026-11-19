import { PaymentMethod, Prisma, SplitMode, TableBillLineKind } from "../../../generated/prisma/client";
import { MAX_SHARES } from "./splitMath";

// Hand-written validators for the table bill routes (guest and staff), the house style: unknown keys are
// a 400, money comes in as a string or number with at most 2 decimals and leaves as Prisma.Decimal.
// A guest's only amounts are a CUSTOM split's (the server checks they add up to the bill exactly, and
// never takes a guest id from a guest: those shares start unclaimed). Every other amount is computed on
// the server.

export class BillValidationError extends Error {}

type Body = Record<string, unknown>;

function asBody(raw: unknown, allowed: string[]): Body {
  if (raw === undefined || raw === null) {
    return {};
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BillValidationError("The body must be a JSON object");
  }
  const body = raw as Body;
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new BillValidationError(`Unknown field${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
  }
  return body;
}

function expectedVersion(body: Body): number {
  const value = body.expectedVersion;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BillValidationError("expectedVersion (the bill version you saw) is required");
  }
  return value;
}

const MONEY = /^\d{1,8}(\.\d{1,2})?$/;

/** A money amount ≥ 0 with at most 2 decimals, as Decimal (never a float). */
export function parseMoney(raw: unknown, field: string): Prisma.Decimal {
  const text = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : typeof raw === "string" ? raw.trim() : null;
  if (text === null || !MONEY.test(text)) {
    throw new BillValidationError(`${field} must be an amount of 0 or more with at most 2 decimals`);
  }
  return new Prisma.Decimal(text);
}

function reason(raw: unknown, field: string, required: boolean): string | null {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    if (required) {
      throw new BillValidationError(`${field} is required`);
    }
    return null;
  }
  if (typeof raw !== "string" || raw.trim().length > 200) {
    throw new BillValidationError(`${field} must be text of at most 200 characters`);
  }
  return raw.trim();
}

const UUIDISH = /^[0-9A-Za-z-]{1,64}$/;

function id(raw: unknown, field: string): string {
  if (typeof raw !== "string" || !UUIDISH.test(raw)) {
    throw new BillValidationError(`${field} is required`);
  }
  return raw;
}

function parts(raw: unknown): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > MAX_SHARES) {
    throw new BillValidationError(`parts must be a whole number from 1 to ${MAX_SHARES}`);
  }
  return raw;
}

// ---------- Guest ----------

export function parseGuestSplit(raw: unknown) {
  const body = asBody(raw, ["mode", "parts", "shares", "expectedVersion"]);
  if (body.mode !== SplitMode.EQUAL && body.mode !== SplitMode.BY_ITEMS && body.mode !== SplitMode.CUSTOM) {
    throw new BillValidationError("mode must be EQUAL, BY_ITEMS or CUSTOM");
  }
  const mode = body.mode as SplitMode;
  let shares: { amount: Prisma.Decimal; guestId: null }[] | undefined;
  if (mode === SplitMode.CUSTOM) {
    if (!Array.isArray(body.shares) || body.shares.length < 1 || body.shares.length > MAX_SHARES) {
      throw new BillValidationError(`shares must list 1 to ${MAX_SHARES} amounts`);
    }
    // Amounts only: a guest can't hand a share to someone else (shares start unclaimed).
    shares = body.shares.map((entry, i) => ({ amount: parseMoney(asBody(entry, ["amount"]).amount, `shares[${i}].amount`), guestId: null }));
  } else if (body.shares !== undefined) {
    throw new BillValidationError("shares is only for a CUSTOM split");
  }
  return { mode, parts: mode === SplitMode.EQUAL ? parts(body.parts) : undefined, shares, expectedVersion: expectedVersion(body) };
}

export function parseClaim(raw: unknown) {
  const body = asBody(raw, ["lineKind", "lineId", "claimed", "expectedVersion"]);
  if (body.lineKind !== TableBillLineKind.ITEM && body.lineKind !== TableBillLineKind.DEAL) {
    throw new BillValidationError("lineKind must be ITEM or DEAL");
  }
  if (typeof body.claimed !== "boolean") {
    throw new BillValidationError("claimed must be true or false");
  }
  return { lineKind: body.lineKind as TableBillLineKind, lineId: id(body.lineId, "lineId"), claimed: body.claimed, expectedVersion: expectedVersion(body) };
}

export function parseExpectedVersionOnly(raw: unknown): number {
  return expectedVersion(asBody(raw, ["expectedVersion"]));
}

export function parsePay(raw: unknown): PaymentMethod {
  const body = asBody(raw, ["method"]);
  if (body.method !== PaymentMethod.CASH && body.method !== PaymentMethod.ONLINE) {
    throw new BillValidationError("method must be CASH or ONLINE");
  }
  return body.method as PaymentMethod;
}

export function parseEmpty(raw: unknown): void {
  asBody(raw, []);
}

// ---------- Staff ----------

export function parseStaffSplit(raw: unknown) {
  const body = asBody(raw, ["mode", "parts", "shares", "expectedVersion"]);
  if (body.mode !== SplitMode.EQUAL && body.mode !== SplitMode.BY_ITEMS && body.mode !== SplitMode.CUSTOM) {
    throw new BillValidationError("mode must be EQUAL, BY_ITEMS or CUSTOM");
  }
  const mode = body.mode as SplitMode;
  let shares: { amount: Prisma.Decimal; guestId: string | null }[] | undefined;
  if (mode === SplitMode.CUSTOM) {
    if (!Array.isArray(body.shares) || body.shares.length < 1 || body.shares.length > MAX_SHARES) {
      throw new BillValidationError(`shares must list 1 to ${MAX_SHARES} amounts`);
    }
    shares = body.shares.map((entry, i) => {
      const share = asBody(entry, ["amount", "guestId"]);
      return {
        amount: parseMoney(share.amount, `shares[${i}].amount`),
        guestId: share.guestId === undefined || share.guestId === null ? null : id(share.guestId, `shares[${i}].guestId`),
      };
    });
  } else if (body.shares !== undefined) {
    throw new BillValidationError("shares is only for a CUSTOM split");
  }
  return { mode, parts: mode === SplitMode.EQUAL ? parts(body.parts) : undefined, shares, expectedVersion: expectedVersion(body) };
}

export function parseDiscount(raw: unknown) {
  const body = asBody(raw, ["discount", "discountReason", "expectedVersion"]);
  return {
    discount: parseMoney(body.discount, "discount"),
    discountReason: reason(body.discountReason, "discountReason", false),
    expectedVersion: expectedVersion(body),
  };
}

export function parseMarkPaid(raw: unknown): Prisma.Decimal | null {
  const body = asBody(raw, ["paidAmount", "expectedVersion"]);
  return body.paidAmount === undefined || body.paidAmount === null ? null : parseMoney(body.paidAmount, "paidAmount");
}

export function parseReason(raw: unknown): string {
  const body = asBody(raw, ["reason", "expectedVersion"]);
  return reason(body.reason, "reason", true) as string;
}

export function parseVerify(raw: unknown): void {
  asBody(raw, ["expectedVersion"]);
}
