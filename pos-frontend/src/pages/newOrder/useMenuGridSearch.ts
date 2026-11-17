import { useDeferredValue, useMemo } from "react";
import type { Deal } from "../../api/deals";
import type { MenuItem } from "../../api/menuItems";
import { buildSearchIndex, isSearchActive, searchIndex } from "../../lib/menuSearch";

interface UseMenuGridSearchInput {
  // Everything this screen may sell, already filtered for availability — memoized by the
  // caller, so the search index is only rebuilt when the menu itself changes.
  orderableItems: MenuItem[];
  orderableDeals: Deal[];
  kitchenFilter: string;
  query: string;
}

// What the menu tile grid shows on New Order / the order taker's screen.
//
// - No search: the kitchen tab filters items, and deals (which span kitchens) only show
//   under "All" — unchanged from before search existed.
// - Searching: the kitchen tab is set aside and every item and deal is searched, so typing
//   always finds an item wherever it lives. Clearing the search puts the tab back in force.
//
// The query is deferred so typing stays responsive even on a slow phone with a big menu.
export function useMenuGridSearch({ orderableItems, orderableDeals, kitchenFilter, query }: UseMenuGridSearchInput) {
  const deferredQuery = useDeferredValue(query);
  const itemIndex = useMemo(
    () => buildSearchIndex(orderableItems, (item) => item.name, (item) => [item.description]),
    [orderableItems],
  );
  const dealIndex = useMemo(
    () => buildSearchIndex(orderableDeals, (deal) => deal.name, (deal) => [deal.description]),
    [orderableDeals],
  );

  return useMemo(() => {
    if (!isSearchActive(deferredQuery)) {
      return {
        isSearching: false,
        visibleItems: orderableItems.filter((item) => kitchenFilter === "" || item.kitchenId === kitchenFilter),
        visibleDeals: kitchenFilter === "" ? orderableDeals : [],
      };
    }
    return {
      isSearching: true,
      visibleItems: searchIndex(itemIndex, deferredQuery),
      visibleDeals: searchIndex(dealIndex, deferredQuery),
    };
  }, [deferredQuery, kitchenFilter, orderableItems, orderableDeals, itemIndex, dealIndex]);
}
