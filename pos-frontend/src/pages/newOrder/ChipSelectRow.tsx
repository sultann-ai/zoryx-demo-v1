import { cn } from "../../components/ui/cn";
import { SELECT_GRID, SELECT_TILE, selectTileState } from "./selectionGrid";

interface ChipOption {
  id: string;
  name: string;
}

interface ChipSelectRowProps {
  label: string;
  options: ChipOption[];
  value: string;
  onChange: (value: string) => void;
}

// An optional single-select: there's a "None" chip at the head of the set, and tapping the
// already-selected chip clears it too — so getting back to unassigned never means hunting for
// the right chip. Laid out on the same grid as the table tiles (selectionGrid.ts) so the two
// line up, and wraps rather than scrolls sideways.
export function ChipSelectRow({ label, options, value, onChange }: ChipSelectRowProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span className="text-meta font-medium text-ink-muted">{label}</span>
      <div role="group" aria-label={label} className={SELECT_GRID}>
        <button
          type="button"
          aria-pressed={value === ""}
          onClick={() => onChange("")}
          className={cn(SELECT_TILE, selectTileState(value === ""))}
        >
          None
        </button>
        {options.map((option) => {
          const isSelected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isSelected}
              title={option.name}
              onClick={() => onChange(isSelected ? "" : option.id)}
              className={cn(SELECT_TILE, selectTileState(isSelected))}
            >
              <span className="max-w-full truncate leading-tight">{option.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
