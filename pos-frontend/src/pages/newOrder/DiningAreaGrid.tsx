import type { DiningArea } from "../../api/diningAreas";
import type { FloorTable } from "../../api/tables";
import { cn } from "../../components/ui/cn";
import { compareTableNames } from "./diningAreaFilter";
import { SELECT_GRID, SELECT_TILE, selectTileState } from "./selectionGrid";
import { availabilityShortLabel, tableAvailability } from "./tableAvailability";

interface DiningAreaTileProps {
  diningArea: DiningArea;
  isSelected: boolean;
  onSelect: (diningAreaId: string) => void;
  // Shown small under the name — the table's area, when the grid mixes areas and two
  // tables can share a name ("Table 1" in both halls).
  sublabel?: string;
  // The table's live state from the floor map (table sync): "Free", "Open", or why it can't be picked.
  floorTable?: FloorTable | undefined;
}

// The menu tile grid's shape, stripped to just a name — same rounded card,
// same border and hover, same tap-to-pick, and the same tile as the waiter chips. Selected is accent-filled, which is
// already what "chosen" looks like on this screen (kitchen filter, order type). A table that can't take an
// order (out of service, still open from yesterday) is disabled and says why, in words.
export function DiningAreaTile({ diningArea, isSelected, onSelect, sublabel, floorTable }: DiningAreaTileProps) {
  const availability = tableAvailability(floorTable);
  const status = availabilityShortLabel(availability);
  const isBlocked = availability.kind === "blocked";
  const detail = [sublabel, status].filter(Boolean).join(" · ");
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={detail ? `${diningArea.name}, ${detail}` : undefined}
      disabled={isBlocked}
      title={availability.kind === "blocked" ? availability.reason : undefined}
      onClick={() => onSelect(diningArea.id)}
      className={cn(
        SELECT_TILE,
        isBlocked ? "cursor-not-allowed border-dashed border-border bg-surface text-ink-muted" : selectTileState(isSelected),
      )}
    >
      <span className="max-w-full truncate leading-tight">{diningArea.name}</span>
      {detail && (
        <span
          className={cn(
            "max-w-full truncate text-meta font-normal leading-tight",
            isSelected && !isBlocked
              ? "text-white/80"
              : availability.kind === "open"
                ? "text-status-active-text"
                : "text-ink-muted",
          )}
        >
          {detail}
        </span>
      )}
    </button>
  );
}

interface DiningAreaGridProps {
  diningAreas: DiningArea[];
  selectedId: string;
  onSelect: (diningAreaId: string) => void;
  // True when the tables shown span more than one area (the "All" filter).
  showArea?: boolean;
  floorById?: Map<string, FloorTable>;
}

export function DiningAreaGrid({ diningAreas, selectedId, onSelect, showArea = false, floorById }: DiningAreaGridProps) {
  if (diningAreas.length === 0) {
    return <p className="text-body text-ink-muted">No active dining areas.</p>;
  }

  return (
    <div role="group" aria-label="Dining area" className={SELECT_GRID}>
      {[...diningAreas].sort(compareTableNames).map((area) => (
        <DiningAreaTile
          key={area.id}
          diningArea={area}
          isSelected={selectedId === area.id}
          onSelect={onSelect}
          floorTable={floorById?.get(area.id)}
          {...(showArea && area.area ? { sublabel: area.area } : {})}
        />
      ))}
    </div>
  );
}
