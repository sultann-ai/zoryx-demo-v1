// Mirrors backend ORDER_LINE_NOTE_MAX_LENGTH (order.service.ts) — the server is what
// actually enforces it; this only keeps the inputs from accepting more than it will take.
export const LINE_NOTE_MAX_LENGTH = 100;

// What a cart line stores and what gets sent: trimmed, "" meaning no note (the server
// drops blank notes the same way).
export function normalizeLineNote(value: string): string {
  return value.trim();
}

// The note(s) that apply to one order item: its own, and — for an item exploded from a
// deal — the deal line's. Shared by every screen/document that shows an item.
export function itemNoteLines(item: {
  notes: string | null;
  dealOrderLine: { notes: string | null } | null;
}): string[] {
  const lines: string[] = [];
  if (item.notes) {
    lines.push(item.notes);
  }
  if (item.dealOrderLine?.notes) {
    lines.push(item.dealOrderLine.notes);
  }
  return lines;
}
