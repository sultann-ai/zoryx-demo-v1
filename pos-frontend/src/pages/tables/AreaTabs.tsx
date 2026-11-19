import { cn } from "../../components/ui/cn";
import { areaLabel } from "./tableStates";

// Same tab-like filter buttons as the Menu page and New Order's kitchen row (aria-pressed, not ARIA
// tabs). Scrolls sideways inside itself when there are many areas, never the page.
const TAB_CLASSES =
  "inline-flex h-11 shrink-0 items-center gap-2 rounded-card border px-4 text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export interface AreaTab {
  // "" = tables with no area ("Other").
  area: string;
  count: number;
  // A small marker after the name (an open call there, unsaved edits there).
  flag?: { label: string; tone: "danger" | "warning" } | null;
}

export function AreaTabs({ tabs, active, onSelect }: { tabs: AreaTab[]; active: string; onSelect: (area: string) => void }) {
  if (tabs.length <= 1) {
    return null;
  }
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Floor area">
      {tabs.map((tab) => {
        const isActive = tab.area === active;
        return (
          <button
            key={tab.area}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(tab.area)}
            className={cn(
              TAB_CLASSES,
              isActive ? "border-accent bg-accent text-white" : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
            )}
          >
            {areaLabel(tab.area)}
            <span className={cn("text-meta tabular-nums", isActive ? "text-white/80" : "text-ink-muted")}>{tab.count}</span>
            {tab.flag && (
              <span
                className={cn("h-2 w-2 rounded-full", tab.flag.tone === "danger" ? "bg-status-danger" : "bg-status-warning")}
                aria-label={tab.flag.label}
                role="img"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
