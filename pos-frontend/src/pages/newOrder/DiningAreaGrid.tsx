import type { DiningArea } from "../../api/diningAreas";
import { cn } from "../../components/ui/cn";
import { compareTableNames } from "./diningAreaFilter";
import { SELECT_GRID, SELECT_TILE, selectTileState } from "./selectionGrid";

interface DiningAreaTileProps {
  diningArea: DiningArea;
  isSelected: boolean;
  onSelect: (diningAreaId: string) => void;
  // Shown small under the name — the table's area, when the grid mixes areas and two
  // tables can share a name ("Table 1" in both halls).
  sublabel?: string;
}

// The menu tile grid's shape, stripped to just a name — same rounded card,
// same border and hover, same tap-to-pick, and the same tile as the waiter chips. Selected is accent-filled, which is
// already what "chosen" looks like on this screen (kitchen filter, order type).
export function DiningAreaTile({ diningArea, isSelected, onSelect, sublabel }: DiningAreaTileProps) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={sublabel ? `${diningArea.name}, ${sublabel}` : undefined}
      onClick={() => onSelect(diningArea.id)}
      className={cn(SELECT_TILE, selectTileState(isSelected))}
    >
      <span className="max-w-full truncate leading-tight">{diningArea.name}</span>
      {sublabel && (
        <span className={cn("max-w-full truncate text-meta font-normal leading-tight", isSelected ? "text-white/80" : "text-ink-muted")}>
          {sublabel}
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
}

export function DiningAreaGrid({ diningAreas, selectedId, onSelect, showArea = false }: DiningAreaGridProps) {
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
          {...(showArea && area.area ? { sublabel: area.area } : {})}
        />
      ))}
    </div>
  );
}
