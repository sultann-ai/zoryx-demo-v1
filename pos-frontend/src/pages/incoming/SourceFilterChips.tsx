import { cn } from "../../components/ui/cn";

// POS = a scheduled POS order that has just been released (the only way a POS order
// reaches Incoming).
export type SourceFilter = "ALL" | "ORDER_TAKER" | "ONLINE" | "POS";

interface SourceFilterChipsProps {
  value: SourceFilter;
  onChange: (value: SourceFilter) => void;
  counts: { all: number; orderTaker: number; online: number; scheduled: number };
}

const CHIP_CLASSES =
  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-card border px-4 text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function chipState(isSelected: boolean): string {
  return isSelected
    ? "border-accent bg-accent text-white"
    : "border-border bg-surface-raised text-ink-muted hover:bg-surface";
}

// Same button/aria-pressed/group-role structure as newOrder/ChipSelectRow.tsx, with a
// count suffix per chip (ChipSelectRow doesn't support one) — a single-select filter
// row, scrolling sideways rather than wrapping, no dropdown.
export function SourceFilterChips({ value, onChange, counts }: SourceFilterChipsProps) {
  const options: { id: SourceFilter; label: string; count: number }[] = [
    { id: "ALL", label: "All", count: counts.all },
    { id: "ORDER_TAKER", label: "Order takers", count: counts.orderTaker },
    { id: "ONLINE", label: "Online", count: counts.online },
    // Only shown while there's one to filter to — most days there are none.
    ...(counts.scheduled > 0 || value === "POS" ? [{ id: "POS" as const, label: "Scheduled", count: counts.scheduled }] : []),
  ];

  return (
    <div role="group" aria-label="Filter by source" className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => {
        const isSelected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(option.id)}
            className={cn(CHIP_CLASSES, chipState(isSelected))}
          >
            {option.label}
            <span className={cn("text-meta", isSelected ? "text-white" : "text-ink-muted")}>({option.count})</span>
          </button>
        );
      })}
    </div>
  );
}
