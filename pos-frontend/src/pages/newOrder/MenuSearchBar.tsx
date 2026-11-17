import { SearchInput } from "../../components/ui";

interface MenuSearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  // Items + deals currently shown; null when not searching (no count line then).
  resultCount: number | null;
}

// Sits above the kitchen tabs on New Order / the order taker's screen. While searching, the
// count line says plainly that every kitchen is being searched, since the selected kitchen
// tab is set aside until the search is cleared (see useMenuGridSearch).
export function MenuSearchBar({ query, onQueryChange, resultCount }: MenuSearchBarProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <SearchInput
        value={query}
        onChange={onQueryChange}
        label="Search menu items and deals"
        placeholder="Search menu items and deals"
      />
      <p aria-live="polite" className="min-h-5 text-meta text-ink-muted">
        {resultCount !== null &&
          resultCount > 0 &&
          `${resultCount} ${resultCount === 1 ? "match" : "matches"} across all kitchens`}
      </p>
    </div>
  );
}
