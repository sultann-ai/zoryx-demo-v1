import { describe, expect, it } from "vitest";
import { Prisma } from "../../../generated/prisma/client";
import {
  allocateDiscount,
  computeByItemsShares,
  computeCustomShares,
  computeEqualShares,
  SplitMathError,
  type BillGuest,
  type BillLine,
} from "./splitMath";

const D = (value: Prisma.Decimal | string | number) => new Prisma.Decimal(value);
const amounts = (shares: { amount: Prisma.Decimal }[]) => shares.map((share) => share.amount.toFixed(2));
const total = (shares: { amount: Prisma.Decimal }[]) => shares.reduce((acc, share) => acc.plus(share.amount), D(0));

const ali: BillGuest = { id: "ali", displayName: "Ali", joinOrder: 1, active: true };
const sara: BillGuest = { id: "sara", displayName: "Sara", joinOrder: 2, active: true };
const omar: BillGuest = { id: "omar", displayName: "Omar", joinOrder: 3, active: true };
const line = (id: string, subtotal: Prisma.Decimal | string | number, ownerGuestId: string | null, kind: "ITEM" | "DEAL" = "ITEM"): BillLine => ({
  kind,
  id,
  subtotal: D(subtotal),
  ownerGuestId,
});

// Spec §7.4 vectors (E1–E3, B1–B4, C1) plus awkward totals.
describe("EQUAL", () => {
  it("E1: 1000 / 3 = 334, 333, 333", () => {
    expect(amounts(computeEqualShares(D(1000), 3))).toEqual(["334.00", "333.00", "333.00"]);
  });
  it("E2: 1000.50 / 4 = 250.50, 250, 250, 250 (share 1 carries the paisa)", () => {
    expect(amounts(computeEqualShares(D("1000.50"), 4))).toEqual(["250.50", "250.00", "250.00", "250.00"]);
  });
  it("E3: 99 / 1 = 99", () => {
    expect(amounts(computeEqualShares(D(99), 1))).toEqual(["99.00"]);
  });
  it("1001 / 3 = 335, 333, 333", () => {
    expect(amounts(computeEqualShares(D(1001), 3))).toEqual(["335.00", "333.00", "333.00"]);
  });
  it("a total smaller than the number of shares: share 1 takes it all", () => {
    expect(amounts(computeEqualShares(D("2.75"), 4))).toEqual(["2.75", "0.00", "0.00", "0.00"]);
  });
  it("labels 'Share k of N' and leaves shares unclaimed", () => {
    const shares = computeEqualShares(D(300), 2);
    expect(shares.map((s) => [s.label, s.guestId])).toEqual([
      ["Share 1 of 2", null],
      ["Share 2 of 2", null],
    ]);
  });
  it("refuses 0 or more than 20 parts", () => {
    expect(() => computeEqualShares(D(100), 0)).toThrow(SplitMathError);
    expect(() => computeEqualShares(D(100), 21)).toThrow(SplitMathError);
    expect(() => computeEqualShares(D(100), 2.5)).toThrow(SplitMathError);
  });
  it("always sums to the total, every share but the first in whole rupees (randomised)", () => {
    for (let i = 0; i < 500; i += 1) {
      const t = D(Math.floor(Math.random() * 5_000_000)).dividedBy(100); // up to 50,000.00 with paisa
      const n = 1 + Math.floor(Math.random() * 20);
      const shares = computeEqualShares(t, n);
      expect(total(shares).equals(t)).toBe(true);
      expect(shares.slice(1).every((s) => s.amount.isInteger())).toBe(true);
      expect(shares.every((s) => !s.amount.isNegative())).toBe(true);
    }
  });
});

describe("BY_ITEMS", () => {
  it("B1: own lines only", () => {
    const shares = computeByItemsShares({
      lines: [line("a", 600, "ali"), line("s", 400, "sara")],
      guests: [ali, sara],
      claims: [],
      subtotal: D(1000),
      total: D(1000),
    });
    expect(shares.map((s) => [s.label, s.amount.toFixed(2)])).toEqual([
      ["Ali", "600.00"],
      ["Sara", "400.00"],
    ]);
  });

  it("B2: an unclaimed shared line is split by everyone at the table", () => {
    const shares = computeByItemsShares({
      lines: [line("a", 600, "ali"), line("s", 300, "sara"), line("fries", 150, null)],
      guests: [ali, sara],
      claims: [],
      subtotal: D(1050),
      total: D(1050),
    });
    expect(amounts(shares)).toEqual(["675.00", "375.00"]);
  });

  it("B3: a shared line claimed by one guest, with a bill discount", () => {
    const shares = computeByItemsShares({
      lines: [line("a", 600, "ali"), line("s", 300, "sara"), line("fries", 150, null)],
      guests: [ali, sara],
      claims: [{ kind: "ITEM", lineId: "fries", guestId: "sara" }],
      subtotal: D(1050),
      total: D(945),
    });
    expect(shares.map((s) => [s.guestId, s.amount.toFixed(2)])).toEqual([
      ["ali", "540.00"],
      ["sara", "405.00"],
    ]);
  });

  it("B4: three guests of 333.33 each on a 1000 bill: the first takes the rounding", () => {
    const shares = computeByItemsShares({
      lines: [line("a", "333.33", "ali"), line("s", "333.33", "sara"), line("o", "333.34", "omar")],
      guests: [ali, sara, omar],
      claims: [],
      subtotal: D(1000),
      total: D(1000),
    });
    expect(amounts(shares)).toEqual(["334.00", "333.00", "333.00"]);
  });

  it("an owned line someone else claimed is shared between the owner and the claimer", () => {
    const shares = computeByItemsShares({
      lines: [line("pizza", 1000, "ali", "DEAL"), line("tea", 101, "sara")],
      guests: [ali, sara],
      claims: [{ kind: "DEAL", lineId: "pizza", guestId: "sara" }],
      subtotal: D(1101),
      total: D(1101),
    });
    expect(amounts(shares)).toEqual(["500.00", "601.00"]);
  });

  it("a shared 1001 line by three, with an awkward discount, still sums exactly", () => {
    const shares = computeByItemsShares({
      lines: [line("platter", 1001, null)],
      guests: [ali, sara, omar],
      claims: [],
      subtotal: D(1001),
      total: D("888.88"),
    });
    expect(total(shares).toFixed(2)).toBe("888.88");
    expect(amounts(shares)).toEqual(["296.88", "296.00", "296.00"]);
  });

  it("a removed guest pays for their own lines but doesn't share unclaimed ones", () => {
    const gone = { ...omar, active: false };
    const shares = computeByItemsShares({
      lines: [line("o", 200, "omar"), line("fries", 100, null)],
      guests: [ali, sara, gone],
      claims: [],
      subtotal: D(300),
      total: D(300),
    });
    expect(shares.map((s) => [s.guestId, s.amount.toFixed(2)])).toEqual([
      ["ali", "50.00"],
      ["sara", "50.00"],
      ["omar", "200.00"],
    ]);
  });

  it("guests owing nothing get no share; claims by unknown guests are ignored", () => {
    const shares = computeByItemsShares({
      lines: [line("a", 500, "ali")],
      guests: [ali, sara],
      claims: [{ kind: "ITEM", lineId: "a", guestId: "stranger" }],
      subtotal: D(500),
      total: D(500),
    });
    expect(shares.map((s) => s.guestId)).toEqual(["ali"]);
  });

  it("always sums to the total, whatever the lines, claims and discount (randomised)", () => {
    const guests = [ali, sara, omar];
    for (let i = 0; i < 300; i += 1) {
      const lines = Array.from({ length: 1 + Math.floor(Math.random() * 8) }, (_, j) =>
        line(`l${j}`, 1 + Math.floor(Math.random() * 3000), [null, "ali", "sara", "omar"][Math.floor(Math.random() * 4)] ?? null),
      );
      const claims = lines
        .filter(() => Math.random() < 0.3)
        .map((l) => ({ kind: "ITEM" as const, lineId: l.id, guestId: guests[Math.floor(Math.random() * 3)]?.id ?? "ali" }));
      const subtotal = total(lines.map((l) => ({ amount: l.subtotal })));
      const t = subtotal.minus(Math.floor(Math.random() * subtotal.toNumber() * 0.3));
      const shares = computeByItemsShares({ lines, guests, claims, subtotal, total: t });
      expect(total(shares).equals(t)).toBe(true);
      expect(shares.slice(1).every((s) => s.amount.isInteger())).toBe(true);
    }
  });
});

describe("CUSTOM", () => {
  it("C1: [500, 300, 150] on a 1000 bill is SPLIT_SUM_MISMATCH, with the numbers", () => {
    const run = () => computeCustomShares(D(1000), [500, 300, 150].map((a) => ({ amount: D(a), guestId: null })));
    expect(run).toThrow(SplitMathError);
    try {
      run();
    } catch (error) {
      expect(error).toMatchObject({ code: "SPLIT_SUM_MISMATCH", extra: { total: "1000.00", sum: "950.00" } });
    }
  });
  it("accepts amounts that add up exactly, paisa only on share 1", () => {
    const shares = computeCustomShares(D("1000.50"), [D("500.50"), D(300), D(200)].map((amount) => ({ amount, guestId: null })));
    expect(amounts(shares)).toEqual(["500.50", "300.00", "200.00"]);
    expect(() => computeCustomShares(D("1000.50"), [D(500), D("300.50"), D(200)].map((amount) => ({ amount, guestId: null })))).toThrow(
      /whole rupees/,
    );
  });
  it("refuses negative amounts, more than 2 decimals, and more than 20 shares", () => {
    expect(() => computeCustomShares(D(100), [{ amount: D(150), guestId: null }, { amount: D(-50), guestId: null }])).toThrow(SplitMathError);
    expect(() => computeCustomShares(D(100), [{ amount: D("100.001"), guestId: null }])).toThrow(SplitMathError);
    expect(() => computeCustomShares(D(21), Array.from({ length: 21 }, () => ({ amount: D(1), guestId: null })))).toThrow(SplitMathError);
  });
});

describe("allocateDiscount", () => {
  const orders = [
    { id: "o1", orderNumber: 1, subtotal: D(600) },
    { id: "o2", orderNumber: 2, subtotal: D(300) },
    { id: "o3", orderNumber: 3, subtotal: D(150) },
  ];
  it("pro-rata, floored, the remainder to the largest order", () => {
    const parts = allocateDiscount(orders, D(100));
    expect([...parts.entries()].map(([id, d]) => [id, d.toFixed(2)])).toEqual([
      ["o1", "58.00"],
      ["o2", "28.00"],
      ["o3", "14.00"],
    ]);
  });
  it("ties go to the lowest order number; paisa goes there too", () => {
    const parts = allocateDiscount(
      [
        { id: "b", orderNumber: 9, subtotal: D(500) },
        { id: "a", orderNumber: 4, subtotal: D(500) },
      ],
      D("100.75"),
    );
    expect(parts.get("a")?.toFixed(2)).toBe("50.75");
    expect(parts.get("b")?.toFixed(2)).toBe("50.00");
  });
  it("a full discount gives every order exactly its subtotal", () => {
    const parts = allocateDiscount(orders, D(1050));
    expect([...parts.values()].map((d) => d.toFixed(2))).toEqual(["600.00", "300.00", "150.00"]);
  });
  it("refuses a discount above the bill, negative, or with fractions of paisa", () => {
    expect(() => allocateDiscount(orders, D(1051))).toThrow(/more than the bill/);
    expect(() => allocateDiscount(orders, D(-1))).toThrow(SplitMathError);
    expect(() => allocateDiscount(orders, D("1.005"))).toThrow(SplitMathError);
  });
  it("always adds up to the discount and never exceeds an order (randomised)", () => {
    for (let i = 0; i < 300; i += 1) {
      const list = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, (_, j) => ({
        id: `o${j}`,
        orderNumber: j,
        subtotal: D(1 + Math.floor(Math.random() * 2000)),
      }));
      const sub = list.reduce((acc, o) => acc.plus(o.subtotal), D(0));
      const discount = D(Math.floor(Math.random() * sub.toNumber() * 100)).dividedBy(100);
      const parts = allocateDiscount(list, discount);
      expect([...parts.values()].reduce((a, b) => a.plus(b), D(0)).equals(discount)).toBe(true);
      expect(list.every((o) => !(parts.get(o.id) ?? D(0)).greaterThan(o.subtotal))).toBe(true);
    }
  });
});
