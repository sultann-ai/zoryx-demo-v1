import { useMemo, useState } from "react";
import { Card, EmptyState, SearchInput } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { OnlineStoreHeader } from "../../components/onlineStore/OnlineStoreHeader";
import { useCategories } from "../../hooks/useCategories";
import { useDeals } from "../../hooks/useDeals";
import { useMenuItems } from "../../hooks/useMenuItems";
import { useUpdateDealOnlineContent, useUpdateMenuItemOnlineContent } from "../../hooks/useOnlineStore";
import { CategoryNamesCard } from "./CategoryNamesCard";
import { OnlineItemCard } from "./OnlineItemCard";
import type { EntryPatch, OnlineEntry } from "./OnlineItemCard";
import { PhotoTipsCard } from "./PhotoTipsCard";

type Filter = "all" | "missing" | "hidden";

const CHIP_CLASSES =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card border px-4 text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function chipState(isSelected: boolean): string {
  return isSelected ? "border-accent bg-accent text-white" : "border-border bg-surface-raised text-ink-muted hover:bg-surface";
}

export function MenuPhotosPage() {
  const { data: items, isLoading: itemsLoading, isError: itemsError } = useMenuItems();
  const { data: deals, isLoading: dealsLoading, isError: dealsError } = useDeals();
  const { data: categories = [] } = useCategories();
  const updateItem = useUpdateMenuItemOnlineContent();
  const updateDeal = useUpdateDealOnlineContent();

  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const itemEntries = useMemo<OnlineEntry[]>(() => {
    const categoryById = new Map(categories.map((category) => [category.id, category]));
    return (items ?? [])
      // An open-price item (a custom cake) is never sold online, so there is nothing to show for it.
      .filter((item) => !item.isOpenPrice)
      .sort((a, b) => {
        const orderA = a.categoryId ? (categoryById.get(a.categoryId)?.sortOrder ?? 0) : Number.MAX_SAFE_INTEGER;
        const orderB = b.categoryId ? (categoryById.get(b.categoryId)?.sortOrder ?? 0) : Number.MAX_SAFE_INTEGER;
        return orderA - orderB || a.name.localeCompare(b.name);
      })
      .map((item) => ({
        kind: "item" as const,
        id: item.id,
        name: item.name,
        subtitle: [
          item.categoryId ? (categoryById.get(item.categoryId)?.name ?? "Uncategorised") : "Uncategorised",
          item.sellableAlone ? null : "Only inside deals",
        ]
          .filter(Boolean)
          .join(" · "),
        imageId: item.imageId,
        nameUr: item.nameUr,
        descriptionUr: item.descriptionUr,
        isAvailableOnline: item.isAvailableOnline,
        isFeatured: item.isFeatured,
      }));
  }, [items, categories]);

  const dealEntries = useMemo<OnlineEntry[]>(
    () =>
      [...(deals ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((deal) => ({
          kind: "deal" as const,
          id: deal.id,
          name: deal.name,
          subtitle: deal.isActive ? "Deal" : "Deal · switched off in the POS",
          imageId: deal.imageId,
          nameUr: deal.nameUr,
          descriptionUr: deal.descriptionUr,
          isAvailableOnline: deal.isAvailableOnline,
          isFeatured: deal.isFeatured,
        })),
    [deals],
  );

  const all = [...itemEntries, ...dealEntries];
  const withPhoto = all.filter((entry) => entry.imageId !== null).length;
  const percent = all.length === 0 ? 0 : Math.round((withPhoto / all.length) * 100);

  const needle = search.trim().toLowerCase();
  const matches = (entry: OnlineEntry) =>
    (filter === "all" || (filter === "missing" ? entry.imageId === null : !entry.isAvailableOnline)) &&
    (needle === "" || entry.name.toLowerCase().includes(needle) || (entry.nameUr ?? "").includes(search.trim()));
  const visibleItems = itemEntries.filter(matches);
  const visibleDeals = dealEntries.filter(matches);
  const counts = {
    all: all.length,
    missing: all.filter((entry) => entry.imageId === null).length,
    hidden: all.filter((entry) => !entry.isAvailableOnline).length,
  };

  async function save(entry: OnlineEntry, patch: EntryPatch): Promise<void> {
    if (entry.kind === "item") {
      await updateItem.mutateAsync({ id: entry.id, input: patch });
    } else {
      await updateDeal.mutateAsync({ id: entry.id, input: patch });
    }
  }

  const isLoading = itemsLoading || dealsLoading;
  const isError = itemsError || dealsError;

  return (
    <div className="flex flex-col gap-6">
      <OnlineStoreHeader title="Menu photos and names" description="What customers see on the website: a photo, the Urdu name and description, and whether it is shown." />

      <Card title="Photo progress">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-body text-ink">
              <span className="font-semibold">{withPhoto}</span> of {all.length} have photos
            </p>
            <span className="text-card-head font-semibold tabular-nums text-ink">{percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label="Items with photos"
            className="h-2.5 w-full overflow-hidden rounded-full bg-status-neutral-bg"
          >
            <div className="h-full rounded-full bg-status-success transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>
      </Card>

      <CategoryNamesCard categories={categories} />
      <PhotoTipsCard />

      <div className="flex flex-col gap-3">
        <SearchInput label="Search the menu" placeholder="Search by name" value={search} onChange={setSearch} />
        <div role="group" aria-label="Filter" className="flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["all", "All", counts.all],
              ["missing", "Missing photo", counts.missing],
              ["hidden", "Not shown online", counts.hidden],
            ] as const
          ).map(([id, label, count]) => (
            <button key={id} type="button" aria-pressed={filter === id} onClick={() => setFilter(id)} className={cn(CHIP_CLASSES, chipState(filter === id))}>
              {label}
              <span className="text-meta opacity-80">{count}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-body text-ink-muted">Loading the menu…</p>}
      {isError && <p className="text-body text-status-danger-text">Could not load the menu.</p>}

      {!isLoading && !isError && visibleItems.length === 0 && visibleDeals.length === 0 && (
        <EmptyState
          title={filter === "missing" ? "Every item has a photo" : "Nothing matches"}
          description={filter === "missing" ? "Nice work — nothing is missing a photo." : "Try another filter or search."}
        />
      )}

      {visibleItems.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Menu items">
          <h2 className="font-heading text-section font-semibold text-ink">Menu items ({visibleItems.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((entry) => (
              <OnlineItemCard key={entry.id} entry={entry} save={save} />
            ))}
          </div>
        </section>
      )}

      {visibleDeals.length > 0 && (
        <section className="flex flex-col gap-3" aria-label="Deals">
          <h2 className="font-heading text-section font-semibold text-ink">Deals ({visibleDeals.length})</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleDeals.map((entry) => (
              <OnlineItemCard key={entry.id} entry={entry} save={save} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
