import { useDeferredValue, useMemo, useState } from "react";
import type { MenuItem } from "../../api/menuItems";
import { Button, SearchInput } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { buildSearchIndex, isSearchActive, searchIndex } from "../../lib/menuSearch";

interface AddItemPickerProps {
  // The raw menu list (react-query data, so a stable reference) — filtered to what can be
  // added here and indexed once per menu load, not per render.
  menuItems: MenuItem[];
  kitchenNameById: Map<string, string>;
  selectedId: string;
  onSelect: (menuItemId: string) => void;
}

function priceLabel(item: MenuItem): string {
  if (item.isOpenPrice) {
    return "Open price";
  }
  const sizes = item.variants.filter((variant) => variant.price !== null);
  if (sizes.length > 0) {
    return `From ${Math.min(...sizes.map((variant) => Number(variant.price))).toFixed(2)}`;
  }
  return item.price !== null ? Number(item.price).toFixed(2) : "—";
}

// Order Detail's "Add item" chooser: a search box over a scrollable list of tap-to-pick rows
// (replacing a plain <select>, which can't be searched on a phone). Same matching as the
// New Order grid (lib/menuSearch.ts). Menu items only — this endpoint doesn't take deals.
export function AddItemPicker({ menuItems, kitchenNameById, selectedId, onSelect }: AddItemPickerProps) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  const index = useMemo(() => {
    const addable = menuItems
      .filter((item) => item.isAvailableInPOS && item.sellableAlone)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    return buildSearchIndex(addable, (item) => item.name, (item) => [item.description]);
  }, [menuItems]);
  const results = useMemo(() => searchIndex(index, deferredQuery), [index, deferredQuery]);
  const selected = index.find((entry) => entry.record.id === selectedId)?.record;
  const isSearching = isSearchActive(deferredQuery);

  return (
    <div className="flex flex-col gap-2">
      <SearchInput value={query} onChange={setQuery} label="Search menu items" placeholder="Search menu items" />
      {selected && (
        <p className="text-meta text-ink-muted">
          Selected: <span className="font-medium text-ink">{selected.name}</span>
        </p>
      )}
      {results.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border bg-surface px-4 py-6 text-center">
          <p className="text-body font-semibold text-ink">No items found</p>
          {isSearching && (
            <>
              <p className="text-meta text-ink-muted">Nothing on the menu matches “{deferredQuery.trim()}”.</p>
              <Button type="button" variant="secondary" onClick={() => setQuery("")}>
                Clear search
              </Button>
            </>
          )}
        </div>
      ) : (
        <div
          role="group"
          aria-label={isSearching ? `${results.length} matching menu items` : "Menu items"}
          className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-card border border-border p-1"
        >
          {results.map((item) => {
            const isSelected = item.id === selectedId;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(item.id)}
                className={cn(
                  "flex min-h-11 w-full items-center justify-between gap-3 rounded-card px-3 py-2 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
                  isSelected ? "bg-accent text-white" : "text-ink hover:bg-surface",
                )}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-body font-medium">{item.name}</span>
                  <span className={cn("text-meta", isSelected ? "text-white/80" : "text-ink-muted")}>
                    {kitchenNameById.get(item.kitchenId) ?? "—"}
                  </span>
                </span>
                <span className={cn("shrink-0 text-numeric", isSelected ? "text-white" : "text-ink-muted")}>
                  {priceLabel(item)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
