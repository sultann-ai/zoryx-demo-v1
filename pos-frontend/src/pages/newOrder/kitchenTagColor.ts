export interface KitchenTagColor {
  dot: string;
  bg: string;
}

// Six hues, deliberately outside the status palette (no blue/green/amber/red)
// so a kitchen's color is never mistaken for an order/item status, and
// spaced apart from each other too (see index.css) so two kitchens never
// land on look-alike colors. Each is dark enough to also work as text.
const TAG_COLORS: KitchenTagColor[] = [
  { dot: "bg-tag-gold", bg: "bg-tag-gold-bg" },
  { dot: "bg-tag-olive", bg: "bg-tag-olive-bg" },
  { dot: "bg-tag-teal", bg: "bg-tag-teal-bg" },
  { dot: "bg-tag-indigo", bg: "bg-tag-indigo-bg" },
  { dot: "bg-tag-violet", bg: "bg-tag-violet-bg" },
  { dot: "bg-tag-magenta", bg: "bg-tag-magenta-bg" },
];

// Assigns colors by each kitchen's position in an id-sorted order, not by
// hashing each id independently — hashing alone can collide even with just
// two or three kitchens (it's not a bijection into 6 buckets), which showed
// up immediately in testing: two real seeded kitchens landed on the same
// color. Sorting first and assigning by position guarantees zero collisions
// for up to six kitchens; only cycles once there are more than that.
export function buildKitchenTagColorMap(kitchenIds: Iterable<string>): Map<string, KitchenTagColor> {
  const sortedIds = Array.from(new Set(kitchenIds)).sort();
  const map = new Map<string, KitchenTagColor>();
  sortedIds.forEach((id, index) => {
    map.set(id, TAG_COLORS[index % TAG_COLORS.length]);
  });
  return map;
}

// For a kitchen id that (unexpectedly) isn't in the map — keeps callers from
// having to null-check on every render.
export const FALLBACK_TAG_COLOR: KitchenTagColor = TAG_COLORS[0];
