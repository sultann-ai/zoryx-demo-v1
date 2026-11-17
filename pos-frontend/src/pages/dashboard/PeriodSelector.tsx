import { useState } from "react";
import type { DashboardPeriod } from "../../api/analytics";
import { Button, Input } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { addDaysTo, daysBetween, karachiToday } from "./format";

export interface PeriodChoice {
  period: DashboardPeriod;
  from: string;
  to: string;
}

const CHIPS: { value: DashboardPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last7", label: "Last 7 days" },
  { value: "last30", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom" },
];

const STORAGE_KEY = "zoryx:dashboard-period";

// Remembered for the browser session only (sessionStorage), per the spec.
export function loadPeriodChoice(): PeriodChoice {
  const fallback: PeriodChoice = { period: "today", from: addDaysTo(karachiToday(), -13), to: karachiToday() };
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<PeriodChoice>;
    if (CHIPS.some((chip) => chip.value === parsed.period)) {
      return { period: parsed.period as DashboardPeriod, from: parsed.from ?? fallback.from, to: parsed.to ?? fallback.to };
    }
  } catch {
    // Storage unavailable or corrupt: fall back to Today.
  }
  return fallback;
}

export function savePeriodChoice(choice: PeriodChoice): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Not remembered; the dashboard still works.
  }
}

export function rangeProblem(from: string, to: string): string | null {
  if (!from || !to) return "Choose both dates.";
  if (to < from) return '"To" must not be before "From".';
  if (daysBetween(from, to) + 1 > 366) return "A range can be at most 366 days.";
  return null;
}

interface PeriodSelectorProps {
  choice: PeriodChoice;
  onChange: (choice: PeriodChoice) => void;
}

// Segmented chips, not a dropdown. On a phone the row scrolls sideways instead of wrapping.
export function PeriodSelector({ choice, onChange }: PeriodSelectorProps) {
  const [draftFrom, setDraftFrom] = useState(choice.from);
  const [draftTo, setDraftTo] = useState(choice.to);
  const problem = rangeProblem(draftFrom, draftTo);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="radiogroup"
        aria-label="Period"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0"
      >
        {CHIPS.map((chip) => {
          const selected = choice.period === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange({ ...choice, period: chip.value })}
              className={cn(
                "h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-body font-medium transition-colors md:h-10",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                selected
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface-raised text-ink hover:border-ink-muted hover:bg-surface",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {choice.period === "custom" && (
        <form
          className="flex flex-col gap-3 rounded-card border border-border bg-surface-raised p-4 sm:flex-row sm:flex-wrap sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (!problem) onChange({ period: "custom", from: draftFrom, to: draftTo });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dash-from" className="text-meta font-medium text-ink-muted">
              From
            </label>
            <Input id="dash-from" type="date" value={draftFrom} max={draftTo || undefined} onChange={(e) => setDraftFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dash-to" className="text-meta font-medium text-ink-muted">
              To
            </label>
            <Input id="dash-to" type="date" value={draftTo} min={draftFrom || undefined} onChange={(e) => setDraftTo(e.target.value)} />
          </div>
          <Button type="submit" variant="primary" disabled={problem !== null}>
            Apply
          </Button>
          {problem && (
            <p role="alert" className="text-meta text-status-danger-text sm:self-center">
              {problem}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
