import { useEffect, useState } from "react";
import { cn } from "../../components/ui/cn";
import { fieldClasses } from "../../components/ui/fieldStyles";
import type { WallTime } from "../../lib/shopTime";
import { formatShopTime, formatTimeUntil, fromWallTime } from "../../lib/shopTime";
import { QUICK_OFFSETS, scheduleError, todayAndTomorrow, wallTimeIn } from "./schedule";

const CHIP_CLASSES =
  "inline-flex h-11 shrink-0 items-center rounded-card border px-4 text-body font-medium transition-colors " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

function chipState(isSelected: boolean): string {
  return isSelected ? "border-accent bg-accent text-white" : "border-border bg-surface-raised text-ink-muted hover:bg-surface";
}

interface SchedulePickerProps {
  value: WallTime;
  onChange: (value: WallTime) => void;
  idPrefix: string;
}

// Picks when a scheduled order is released, in Pakistan time: quick chips (+30 min, +1 hour,
// +2 hours), Today/Tomorrow, and the native time input — chips and a picker, no dropdowns. A
// line underneath states exactly when it will be released (and how far away), or what's
// wrong with the choice, re-checked every 30 seconds as time passes.
export function SchedulePicker({ value, onChange, idPrefix }: SchedulePickerProps) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const { today, tomorrow } = todayAndTomorrow(now);
  const error = scheduleError(value, now);
  const instant = error === null ? fromWallTime(value) : null;

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Quick times" className="flex gap-2 overflow-x-auto pb-1">
        {QUICK_OFFSETS.map((offset) => (
          <button
            key={offset.minutes}
            type="button"
            onClick={() => onChange(wallTimeIn(offset.minutes, new Date()))}
            className={cn(CHIP_CLASSES, chipState(false))}
          >
            {offset.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Day" className="flex gap-2">
          {[
            { date: today, label: "Today" },
            { date: tomorrow, label: "Tomorrow" },
          ].map((day) => (
            <button
              key={day.label}
              type="button"
              aria-pressed={value.date === day.date}
              onClick={() => onChange({ ...value, date: day.date })}
              className={cn(CHIP_CLASSES, chipState(value.date === day.date))}
            >
              {day.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${idPrefix}-time`} className="text-meta font-medium text-ink-muted">
            Time (Pakistan)
          </label>
          <input
            id={`${idPrefix}-time`}
            type="time"
            step={60}
            required
            value={value.time}
            onChange={(event) => onChange({ ...value, time: event.target.value })}
            className={cn(fieldClasses, "h-11 w-36")}
          />
        </div>
      </div>
      <p
        aria-live="polite"
        className={cn("text-body", error ? "text-status-danger-text" : "text-ink")}
        role={error ? "alert" : undefined}
      >
        {error ??
          (instant &&
            `Sent to Incoming orders at ${formatShopTime(instant, now)} (${formatTimeUntil(instant, now)}). Until then it stays on hold — no kitchen, no printing, no stock used.`)}
      </p>
    </div>
  );
}
