// One grid and one tile shape for every "pick one of these" set on the New Order screens, so the
// table tiles and the waiter/rider chips line up on the same columns, at the same height, with
// the same gaps — whichever of them is on screen.

// Equal-width columns that fill the row and wrap (two across on a phone).
export const SELECT_GRID = "grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2";

export const SELECT_TILE =
  "flex h-14 min-w-0 flex-col items-center justify-center rounded-card border px-3 text-center text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export function selectTileState(isSelected: boolean): string {
  return isSelected
    ? "border-accent bg-accent text-white"
    : "border-border bg-surface-raised text-ink hover:border-accent";
}
