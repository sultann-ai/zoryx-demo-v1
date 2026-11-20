import { useEffect, useRef, useState } from "react";
import type { DiningArea } from "../../api/diningAreas";
import type { FloorTable } from "../../api/tables";
import { cn } from "../../components/ui/cn";
import { GroupedDiningAreaGrid } from "../takeOrder/GroupedDiningAreaGrid";
import { DiningAreaGrid } from "./DiningAreaGrid";
import { tableAvailability } from "./tableAvailability";
import type { AreaChip } from "./diningAreaFilter";
import {
  ALL_AREAS_KEY,
  buildAreaChips,
  filterByArea,
  loadStoredAreaFilter,
  resolveAreaFilter,
  storeAreaFilter,
} from "./diningAreaFilter";

// Same chip look as ChipSelectRow/KitchenTabs on this screen: 44px tall, accent-filled
// when selected, one row that scrolls sideways on a phone rather than wrapping.
const CHIP_CLASSES =
  "inline-flex h-11 shrink-0 items-center rounded-card border px-4 text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function AreaFilterChips({
  chips,
  activeKey,
  onSelect,
}: {
  chips: AreaChip[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const activeRef = useRef<HTMLButtonElement>(null);

  // A remembered filter may sit past the right edge on a phone — bring it into view.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [activeKey]);

  const all: AreaChip = { key: ALL_AREAS_KEY, label: "All" };
  return (
    <div role="group" aria-label="Filter tables by area" className="flex gap-2 overflow-x-auto pb-1">
      {[all, ...chips].map((chip) => {
        const isActive = chip.key === activeKey;
        return (
          <button
            key={chip.key}
            ref={isActive ? activeRef : undefined}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(chip.key)}
            className={cn(
              CHIP_CLASSES,
              isActive ? "border-accent bg-accent text-white" : "border-border bg-surface-raised text-ink-muted hover:bg-surface",
            )}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

interface DiningAreaPickerProps {
  // Active tables only — the chips are built from exactly these.
  diningAreas: DiningArea[];
  selectedId: string;
  onSelect: (diningAreaId: string) => void;
  // "flat": one grid, each tile labelled with its area under "All" (POS New Order).
  // "grouped": a heading per area (the order taker's table step).
  layout?: "flat" | "grouped";
  // The live floor map by table id (table sync): each tile says whether it's free, open or unavailable,
  // and the line under the grid says what this order will do to the chosen table.
  floorById?: Map<string, FloorTable>;
}

// "Add to Family Hall · Table 2's bill" / "Table 2 is free — this order seats it" / why it can't be used.
export function TableChoiceNote({ table, floorTable }: { table: DiningArea | undefined; floorTable: FloorTable | undefined }) {
  if (!table) {
    return null;
  }
  const availability = tableAvailability(floorTable);
  const name = table.area ? `${table.area} · ${table.name}` : table.name;
  if (availability.kind === "open") {
    return (
      <p role="status" className="m-0 rounded-card border border-status-active bg-status-active-bg px-3 py-2 text-body text-ink">
        <strong>Add to {name}&rsquo;s bill.</strong>{" "}
        <span className="text-ink-muted">
          It&rsquo;s already open ({availability.summary}){availability.joinedTo ? `, joined with ${availability.joinedTo}` : ""} — this order
          goes on the same bill.
        </span>
      </p>
    );
  }
  if (availability.kind === "free") {
    return (
      <p role="status" className="m-0 text-body text-ink-muted">
        <strong className="text-ink">{name} is free.</strong> Sending this order seats it — the table shows as taken right away.
      </p>
    );
  }
  if (availability.kind === "blocked") {
    return (
      <p role="alert" className="m-0 text-body text-status-danger-text">
        {name}: {availability.reason}
      </p>
    );
  }
  return null;
}

// The table picker for both New Order screens: area chips ("All" + every area in use +
// "Other") above the tables. The chosen chip is remembered for the browser session. A table
// that's already selected stays selected when the filter hides it.
export function DiningAreaPicker({ diningAreas, selectedId, onSelect, layout = "flat", floorById }: DiningAreaPickerProps) {
  const chips = buildAreaChips(diningAreas);
  const [storedKey, setStoredKey] = useState<string | null>(() => loadStoredAreaFilter());
  const activeKey = resolveAreaFilter(storedKey, chips);
  const visible = filterByArea(diningAreas, activeKey);

  function handleSelectChip(key: string) {
    setStoredKey(key);
    storeAreaFilter(key);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Nothing to filter between with a single area (or none). */}
      {chips.length > 1 && <AreaFilterChips chips={chips} activeKey={activeKey} onSelect={handleSelectChip} />}
      {layout === "grouped" ? (
        <GroupedDiningAreaGrid diningAreas={visible} selectedId={selectedId} onSelect={onSelect} {...(floorById ? { floorById } : {})} />
      ) : (
        <DiningAreaGrid
          diningAreas={visible}
          selectedId={selectedId}
          onSelect={onSelect}
          showArea={activeKey === ALL_AREAS_KEY && chips.length > 1}
          {...(floorById ? { floorById } : {})}
        />
      )}
      {floorById && <TableChoiceNote table={diningAreas.find((area) => area.id === selectedId)} floorTable={floorById.get(selectedId)} />}
    </div>
  );
}
