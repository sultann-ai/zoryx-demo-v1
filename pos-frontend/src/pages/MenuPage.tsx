import { useState } from "react";
import { AddOnsTab } from "./menu/AddOnsTab";
import { DealsTab } from "./menu/DealsTab";
import { MenuItemsTab } from "./menu/MenuItemsTab";
import { PageHeader } from "../components/ui";
import { cn } from "../components/ui/cn";

type MenuTab = "items" | "deals" | "addons";

const TAB_CLASSES =
  "inline-flex h-11 items-center rounded-card border px-4 text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

export function MenuPage() {
  const [tab, setTab] = useState<MenuTab>("items");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Menu" />

      {/* A filter-style toggle, not true ARIA tabs — same pattern as New Order's
          kitchen filter row (KitchenTabs), which this codebase already treats as
          the tab-like convention for a two-way switch with no dedicated Tabs component. */}
      <div className="flex gap-2" aria-label="Menu section">
        <button
          type="button"
          aria-pressed={tab === "items"}
          onClick={() => setTab("items")}
          className={cn(
            TAB_CLASSES,
            tab === "items"
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
          )}
        >
          Menu
        </button>
        <button
          type="button"
          aria-pressed={tab === "deals"}
          onClick={() => setTab("deals")}
          className={cn(
            TAB_CLASSES,
            tab === "deals"
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
          )}
        >
          Deals
        </button>
        <button
          type="button"
          aria-pressed={tab === "addons"}
          onClick={() => setTab("addons")}
          className={cn(
            TAB_CLASSES,
            tab === "addons"
              ? "border-accent bg-accent text-white"
              : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
          )}
        >
          Add-ons
        </button>
      </div>

      {tab === "items" && <MenuItemsTab />}
      {tab === "deals" && <DealsTab />}
      {tab === "addons" && <AddOnsTab />}
    </div>
  );
}
