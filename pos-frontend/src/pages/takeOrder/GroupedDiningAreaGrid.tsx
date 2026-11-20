import type { DiningArea } from "../../api/diningAreas";
import type { FloorTable } from "../../api/tables";
import { DiningAreaTile } from "../newOrder/DiningAreaGrid";
import { groupByArea } from "../newOrder/diningAreaFilter";
import { SELECT_GRID } from "../newOrder/selectionGrid";

interface GroupedDiningAreaGridProps {
  diningAreas: DiningArea[];
  selectedId: string;
  onSelect: (diningAreaId: string) => void;
  floorById?: Map<string, FloorTable>;
}

// Same tiles as newOrder/DiningAreaGrid.tsx, under a heading per area (DiningArea.area,
// "Other" for none) instead of one flat grid — a waiter picking a table across two halls
// benefits from the grouping. Headings are dropped when there's only one group (e.g. one
// area chip is selected), where they'd just repeat the chip.
export function GroupedDiningAreaGrid({ diningAreas, selectedId, onSelect, floorById }: GroupedDiningAreaGridProps) {
  if (diningAreas.length === 0) {
    return <p className="text-body text-ink-muted">No active dining areas.</p>;
  }

  const groups = groupByArea(diningAreas);
  const showHeadings = groups.length > 1;

  return (
    <div className="flex flex-col gap-6">
      {groups.map(({ chip, tables }) => (
        <div key={chip.key} className="flex flex-col gap-2">
          {showHeadings && <h2 className="text-meta font-medium text-ink-muted">{chip.label}</h2>}
          <div role="group" aria-label={chip.label} className={SELECT_GRID}>
            {tables.map((area) => (
              <DiningAreaTile
                key={area.id}
                diningArea={area}
                isSelected={selectedId === area.id}
                onSelect={onSelect}
                floorTable={floorById?.get(area.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
