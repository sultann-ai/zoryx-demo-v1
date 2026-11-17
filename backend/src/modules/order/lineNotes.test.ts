import { describe, expect, it } from "vitest";
import {
  InvalidLineNoteError,
  InvalidOrderDealsError,
  InvalidOrderItemsError,
  ORDER_LINE_NOTE_MAX_LENGTH,
  parseLineNote,
  parseOrderDeals,
  parseOrderItems,
} from "./order.service";

// Pure shape/format validation only — no Prisma client, no database. The DB-aware half
// (which statuses allow a note edit, the kitchen push) is covered by manual verification
// against the local dev DB instead; see docs/AS_BUILT_BACKEND.md, same pattern as
// openPrice.test.ts/dealCustomization.test.ts.
describe("parseLineNote", () => {
  it("trims surrounding whitespace", () => {
    expect(parseLineNote("  no onion  ", "notes", InvalidLineNoteError)).toBe("no onion");
  });

  it("treats absent, null, empty and whitespace-only as no note", () => {
    expect(parseLineNote(undefined, "notes", InvalidLineNoteError)).toBeNull();
    expect(parseLineNote(null, "notes", InvalidLineNoteError)).toBeNull();
    expect(parseLineNote("", "notes", InvalidLineNoteError)).toBeNull();
    expect(parseLineNote("   ", "notes", InvalidLineNoteError)).toBeNull();
  });

  it(`accepts exactly ${ORDER_LINE_NOTE_MAX_LENGTH} characters`, () => {
    const note = "x".repeat(ORDER_LINE_NOTE_MAX_LENGTH);
    expect(parseLineNote(note, "notes", InvalidLineNoteError)).toBe(note);
  });

  it("measures the length after trimming", () => {
    const note = `  ${"x".repeat(ORDER_LINE_NOTE_MAX_LENGTH)}  `;
    expect(parseLineNote(note, "notes", InvalidLineNoteError)).toBe("x".repeat(ORDER_LINE_NOTE_MAX_LENGTH));
  });

  it(`rejects more than ${ORDER_LINE_NOTE_MAX_LENGTH} characters`, () => {
    expect(() => parseLineNote("x".repeat(ORDER_LINE_NOTE_MAX_LENGTH + 1), "notes", InvalidLineNoteError)).toThrow(
      `notes must be at most ${ORDER_LINE_NOTE_MAX_LENGTH} characters`,
    );
  });

  it("rejects a non-string", () => {
    expect(() => parseLineNote(42, "notes", InvalidLineNoteError)).toThrow(InvalidLineNoteError);
  });

  it("throws the caller's error class", () => {
    expect(() => parseLineNote(42, "items[0].notes", InvalidOrderItemsError)).toThrow(InvalidOrderItemsError);
  });
});

describe("parseOrderItems — notes", () => {
  it("trims a note and keeps it alongside size and add-ons", () => {
    const [item] = parseOrderItems([
      { menuItemId: "pizza", quantity: 2, variantId: "large", addOnIds: ["cheese"], notes: "  extra spicy " },
    ]);
    expect(item).toEqual({
      menuItemId: "pizza",
      quantity: 2,
      variantId: "large",
      addOnIds: ["cheese"],
      notes: "extra spicy",
    });
  });

  it("drops a whitespace-only note instead of storing it", () => {
    const [item] = parseOrderItems([{ menuItemId: "burger", quantity: 1, notes: "   " }]);
    expect(item).not.toHaveProperty("notes");
  });

  it("rejects an over-long note with the item's path in the message", () => {
    expect(() =>
      parseOrderItems([{ menuItemId: "burger", quantity: 1, notes: "x".repeat(ORDER_LINE_NOTE_MAX_LENGTH + 1) }]),
    ).toThrow(new InvalidOrderItemsError(`items[0].notes must be at most ${ORDER_LINE_NOTE_MAX_LENGTH} characters`));
  });
});

describe("parseOrderDeals — notes", () => {
  it("accepts a trimmed note on a plain deal line", () => {
    const [deal] = parseOrderDeals([{ dealId: "deal-1", quantity: 2, notes: " no onion " }]);
    expect(deal).toEqual({ dealId: "deal-1", quantity: 2, notes: "no onion" });
  });

  it("accepts a note on a customized deal line", () => {
    const [deal] = parseOrderDeals(
      [
        {
          dealId: "deal-1",
          quantity: 1,
          notes: "no ice",
          customization: { items: [{ menuItemId: "burger", quantity: 1 }], finalPrice: 500 },
        },
      ],
      { allowCustomization: true },
    );
    expect(deal?.notes).toBe("no ice");
    expect(deal?.customization?.items).toHaveLength(1);
  });

  it("omits notes when blank", () => {
    const [deal] = parseOrderDeals([{ dealId: "deal-1", quantity: 1, notes: "" }]);
    expect(deal).not.toHaveProperty("notes");
  });

  it("rejects an over-long note as an InvalidOrderDealsError", () => {
    expect(() =>
      parseOrderDeals([{ dealId: "deal-1", quantity: 1, notes: "x".repeat(ORDER_LINE_NOTE_MAX_LENGTH + 1) }]),
    ).toThrow(InvalidOrderDealsError);
  });
});
