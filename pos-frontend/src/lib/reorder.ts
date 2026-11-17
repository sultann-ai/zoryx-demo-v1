// Up/down reordering for the website lists (delivery areas, payment accounts, gallery,
// testimonials). The server stores a plain `sortOrder`, and rows created without one all share 0, so
// "swap with the neighbour" isn't enough — instead the list is renumbered 0..n-1 in its new order and
// only the rows whose number actually changes are returned.

export interface Orderable {
  id: string;
  sortOrder: number;
}

export interface OrderUpdate {
  id: string;
  sortOrder: number;
}

// `rows` must already be in display order (the server returns them sorted).
export function moveRow(rows: Orderable[], id: string, direction: "up" | "down"): OrderUpdate[] {
  const index = rows.findIndex((row) => row.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= rows.length) {
    return [];
  }
  const reordered = [...rows];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved!);
  return reordered.flatMap((row, position) => (row.sortOrder === position ? [] : [{ id: row.id, sortOrder: position }]));
}
