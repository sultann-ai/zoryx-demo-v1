import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { cn } from "../../components/ui/cn";
import { formatChange, formatRsCompact } from "./format";

// Shared look for every dashboard chart: dashed horizontal grid only, compact axis labels,
// muted ticks, one tooltip style, and animations that switch off for prefers-reduced-motion.

export const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
] as const;

export const GRID_PROPS = { strokeDasharray: "3 3", vertical: false, stroke: "var(--color-border)" } as const;
export const TICK = { fill: "var(--color-ink-muted)", fontSize: 12 } as const;
export const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

export const moneyAxis = { tick: TICK, axisLine: false, tickLine: false, width: 52, tickFormatter: (v: number) => formatRsCompact(v) } as const;
export const countAxis = { tick: TICK, axisLine: false, tickLine: false, width: 32, allowDecimals: false } as const;
export const categoryAxis = { tick: TICK, axisLine: { stroke: "var(--color-border)" }, tickLine: false } as const;

function subscribe(callback: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

// Props that make a Recharts series animate briefly, or not at all.
export function useAnimation() {
  const reduced = usePrefersReducedMotion();
  return { isAnimationActive: !reduced, animationDuration: 500 } as const;
}

export function ChartCard({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-card border border-border bg-surface-raised p-4 shadow-sm", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-card-head font-semibold text-ink">{title}</h3>
          {subtitle && <p className="text-meta text-ink-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// Small segmented switch (Sales / Orders, Revenue / Quantity).
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-card border border-border bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "h-8 rounded-[3px] px-3 text-meta font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            option.value === value ? "bg-surface-raised text-ink shadow-sm" : "text-ink-muted hover:text-ink",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface TipRow {
  label: string;
  value: string;
  color?: string;
  // Percent change versus the previous period, shown beside the value when given.
  change?: { pct: number | null; current: number; goodWhen?: "up" | "down" };
}

export function TooltipBox({ title, rows, footer }: { title: string; rows: TipRow[]; footer?: string }) {
  return (
    <div className="pointer-events-none min-w-40 max-w-64 rounded-card border border-border bg-surface-raised px-3 py-2 text-meta shadow-lg">
      <div className="mb-1 font-semibold text-ink">{title}</div>
      <ul className="flex list-none flex-col gap-0.5">
        {rows.map((row) => {
          const up = (row.change?.pct ?? 0) > 0;
          const good = row.change ? (row.change.goodWhen === "down" ? !up : up) : null;
          return (
            <li key={row.label} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-ink-muted">
                {row.color && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: row.color }} />}
                {row.label}
              </span>
              <span className="flex items-center gap-1.5 tabular-nums text-ink">
                <span className="font-medium">{row.value}</span>
                {row.change && (
                  <span
                    className={cn(
                      "font-semibold",
                      row.change.pct === null || row.change.pct === 0
                        ? "text-ink-muted"
                        : good
                          ? "text-status-success-text"
                          : "text-status-danger-text",
                    )}
                  >
                    {row.change.pct !== null && row.change.pct !== 0 ? (up ? "▲ " : "▼ ") : ""}
                    {formatChange(row.change.pct, row.change.current)}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {footer && <div className="mt-1 border-t border-border pt-1 text-ink-muted">{footer}</div>}
    </div>
  );
}

// Recharts calls `content` with the hovered/touched point(s); this pulls the first row's
// original data object out so each chart can describe it however it likes.
export function tooltipFor<T>(render: (point: T) => ReactNode) {
  return function TooltipContent({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
    const point = payload?.[0]?.payload as T | undefined;
    return active && point ? <>{render(point)}</> : null;
  };
}
