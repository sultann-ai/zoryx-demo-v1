import { cn } from "../../components/ui/cn";
import { LEGEND_STATES, TABLE_STATE_META, shapeClassesForState } from "./tableStates";

// What the colours mean. A <details> so it folds away on a phone once learned; open on wider screens
// is the caller's choice via `defaultOpen`.
export function FloorLegend({ defaultOpen }: { defaultOpen: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-card border border-border bg-surface-raised">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-body font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
        Legend
        <span className="text-meta text-ink-muted group-open:hidden">Show</span>
        <span className="hidden text-meta text-ink-muted group-open:inline">Hide</span>
      </summary>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 px-3 pb-3 pl-3">
        {LEGEND_STATES.map((state) => (
          <li key={state} className="flex items-center gap-2 text-meta text-ink">
            <span className={cn("h-4 w-6 shrink-0 rounded-card border-2", shapeClassesForState(state))} aria-hidden="true" />
            {TABLE_STATE_META[state].label}
          </li>
        ))}
        <li className="flex items-center gap-2 text-meta text-ink">
          <span className="h-4 w-6 shrink-0 rounded-card border-2 border-border bg-surface-raised ring-2 ring-status-danger" aria-hidden="true" />
          Waiter call (pulses until answered)
        </li>
        <li className="flex items-center gap-2 text-meta text-ink">
          <span className="rounded-full border border-status-active px-1.5 font-semibold text-status-active-text">1/3 paid</span>
          Shares paid so far
        </li>
      </ul>
    </details>
  );
}
