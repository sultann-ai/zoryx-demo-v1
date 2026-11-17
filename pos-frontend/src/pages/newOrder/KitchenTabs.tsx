import type { Kitchen } from "../../api/kitchens";
import { cn } from "../../components/ui/cn";
import type { KitchenTagColor } from "./kitchenTagColor";
import { FALLBACK_TAG_COLOR } from "./kitchenTagColor";

interface KitchenTabsProps {
  kitchens: Kitchen[];
  activeKitchenId: string;
  onSelect: (kitchenId: string) => void;
  tagColorById: Map<string, KitchenTagColor>;
}

const TAB_CLASSES =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-card border px-4 text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

// A filter, not a set of independently-navigable panels — plain toggle
// buttons with aria-pressed, not the tablist/tab ARIA pattern (which implies
// arrow-key navigation and a distinct panel per tab that this isn't).
export function KitchenTabs({ kitchens, activeKitchenId, onSelect, tagColorById }: KitchenTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filter by kitchen">
      <button
        type="button"
        aria-pressed={activeKitchenId === ""}
        onClick={() => onSelect("")}
        className={cn(
          TAB_CLASSES,
          activeKitchenId === ""
            ? "border-accent bg-accent text-white"
            : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
        )}
      >
        All
      </button>
      {kitchens.map((kitchen) => {
        const isActive = activeKitchenId === kitchen.id;
        const tag = tagColorById.get(kitchen.id) ?? FALLBACK_TAG_COLOR;
        return (
          <button
            key={kitchen.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(kitchen.id)}
            className={cn(
              TAB_CLASSES,
              isActive ? cn("border-transparent text-ink", tag.bg) : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
            )}
          >
            <span className={cn("h-2 w-2 shrink-0 rounded-full", tag.dot)} aria-hidden="true" />
            {kitchen.name}
          </button>
        );
      })}
    </div>
  );
}
