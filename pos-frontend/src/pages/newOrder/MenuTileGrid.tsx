import type { ReactNode } from "react";
import type { Deal } from "../../api/deals";
import type { MenuItem } from "../../api/menuItems";
import { Button, EmptyState, StatusBadge } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import type { KitchenTagColor } from "./kitchenTagColor";
import { FALLBACK_TAG_COLOR } from "./kitchenTagColor";

// The card itself is a div so it can hold two separate buttons (a <button> can't contain another):
// the whole face adds one (or opens the size / price picker), and the round "+" is the same action
// as a clear, thumb-sized target. Hover lifts the card a little; reduced-motion users get the
// shadow without the movement.
const TILE_CLASSES =
  "group relative h-36 rounded-card border border-border shadow-sm transition-[transform,box-shadow,border-color] duration-150 " +
  "hover:border-accent hover:shadow-md motion-safe:hover:-translate-y-0.5 focus-within:border-accent";

const FACE_CLASSES =
  "flex h-full w-full cursor-pointer flex-col items-start justify-between gap-2 rounded-card border-0 bg-transparent p-4 text-left " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function MenuTile({
  onActivate,
  addLabel,
  className,
  children,
}: {
  onActivate: () => void;
  addLabel: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn(TILE_CLASSES, className)}>
      <button type="button" onClick={onActivate} className={FACE_CLASSES}>
        {children}
      </button>
      <button
        type="button"
        aria-label={addLabel}
        title={addLabel}
        onClick={onActivate}
        className={cn(
          "absolute bottom-3 right-3 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border-0 bg-accent text-white shadow-sm transition-colors",
          "hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        )}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

interface MenuTileGridProps {
  items: MenuItem[];
  kitchenNameById: Map<string, string>;
  onAddItem: (menuItemId: string) => void;
  // A sized item (has any priced variant) opens the size picker instead of adding
  // directly — see NewOrderPage's sizePickerItem state.
  onPickSize: (item: MenuItem) => void;
  // An open-price item (no menu-set price) opens the price-entry dialog instead —
  // see NewOrderPage's openPriceTarget state.
  onOpenPricePrompt: (item: MenuItem) => void;
  tagColorById: Map<string, KitchenTagColor>;
  deals: Deal[];
  onAddDeal: (dealId: string) => void;
  // Set while the search box has text — changes the empty state to "No items found".
  searchQuery?: string;
  onClearSearch?: () => void;
}

function pricedVariants(item: MenuItem) {
  return item.variants.filter((variant) => variant.price !== null);
}

// Tapping a tile adds 1 immediately (or opens the size picker for a sized item) — no
// confirm step. Precise quantity/removal/notes live in the cart panel instead.
export function MenuTileGrid({
  items,
  kitchenNameById,
  onAddItem,
  onPickSize,
  onOpenPricePrompt,
  tagColorById,
  deals,
  onAddDeal,
  searchQuery,
  onClearSearch,
}: MenuTileGridProps) {
  if (items.length === 0 && deals.length === 0) {
    if (searchQuery) {
      return (
        <EmptyState
          title="No items found"
          description={`Nothing on the menu matches “${searchQuery.trim()}”. Try fewer letters or another word.`}
          action={
            onClearSearch && (
              <Button type="button" variant="secondary" onClick={onClearSearch}>
                Clear search
              </Button>
            )
          }
        />
      );
    }
    return <EmptyState title="No items here" description="Try a different kitchen filter." />;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] sm:gap-4">
      {/* A deal isn't scoped to one kitchen, so it can't take a kitchen-color tag
          the way a menu item tile does — it stays neutral and is called out with
          a small "Deal" label instead, keeping kitchen-color and status-color as
          the only two color systems on this screen. */}
      {deals.map((deal) => (
        <MenuTile key={deal.id} onActivate={() => onAddDeal(deal.id)} addLabel={`Add ${deal.name}`} className="bg-surface-raised">
          <StatusBadge status="DEAL_TAG" label="Deal" />
          <div className="flex w-full flex-col gap-0.5">
            <span className="line-clamp-2 text-card-head font-semibold leading-tight text-ink">{deal.name}</span>
            {/* One step down in the type scale, and truncated to a single line —
                a deal's description can run long, but the tile still has to line
                up with the fixed-height grid around it. */}
            {deal.description && <span className="truncate text-body text-ink-muted">{deal.description}</span>}
          </div>
          <span className="text-numeric text-ink-muted">{Number(deal.price).toFixed(2)}</span>
        </MenuTile>
      ))}
      {items.map((item) => {
        const tag = tagColorById.get(item.kitchenId) ?? FALLBACK_TAG_COLOR;
        const sizes = pricedVariants(item);
        const isSized = sizes.length > 0;
        const lowestPrice = isSized ? Math.min(...sizes.map((variant) => Number(variant.price))) : null;
        return (
          <MenuTile
            key={item.id}
            onActivate={() => (item.isOpenPrice ? onOpenPricePrompt(item) : isSized ? onPickSize(item) : onAddItem(item.id))}
            addLabel={item.isOpenPrice ? `Enter a price for ${item.name}` : isSized ? `Choose a size for ${item.name}` : `Add ${item.name}`}
            className={tag.bg}
          >
            <span className="flex items-center gap-1.5 text-meta font-medium text-ink-muted">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", tag.dot)} aria-hidden="true" />
              {kitchenNameById.get(item.kitchenId) ?? "—"}
            </span>
            <span className="line-clamp-2 text-card-head font-semibold leading-tight text-ink">{item.name}</span>
            <span className="text-numeric text-ink-muted">
              {item.isOpenPrice ? "Open price" : isSized ? `From ${lowestPrice!.toFixed(2)}` : Number(item.price).toFixed(2)}
            </span>
          </MenuTile>
        );
      })}
    </div>
  );
}
