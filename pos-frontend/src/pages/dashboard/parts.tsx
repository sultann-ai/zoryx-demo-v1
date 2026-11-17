import type { ReactNode } from "react";
import { cn } from "../../components/ui/cn";
import { formatChange } from "./format";

// Small building blocks shared by the KPI row, the insights and the tables.

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("rounded-card bg-border/60 motion-safe:animate-pulse", className)} />;
}

export function SectionHeading({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="font-heading text-section font-semibold text-ink">{children}</h2>
      {hint && <p className="text-meta text-ink-muted">{hint}</p>}
    </div>
  );
}

// Arrow plus a signed percentage, so direction is never carried by colour alone. `goodWhen`
// flips which direction is green (cancelled orders and expenses are good when they go down).
export function DeltaChip({
  pct,
  current,
  goodWhen = "up",
  className,
}: {
  pct: number | null;
  current?: number;
  goodWhen?: "up" | "down";
  className?: string;
}) {
  const flat = pct === null || Math.abs(pct) < 0.05;
  const up = (pct ?? 0) > 0;
  const good = flat ? null : up === (goodWhen === "up");
  const tone = flat
    ? "bg-status-neutral-bg text-status-neutral-text"
    : good
      ? "bg-status-success-bg text-status-success-text"
      : "bg-status-danger-bg text-status-danger-text";
  const arrow = flat ? "→" : up ? "▲" : "▼";
  const label = flat
    ? pct === null && current && current > 0
      ? "New, nothing to compare with"
      : "No change"
    : `${up ? "Up" : "Down"} ${Math.abs(Math.round((pct ?? 0) * 10) / 10)} percent`;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-semibold tabular-nums", tone, className)}
      title={`${label} versus the previous period`}
    >
      <span aria-hidden="true" className="text-[10px] leading-none">
        {arrow}
      </span>
      <span aria-hidden="true">{formatChange(pct, current)}</span>
      <span className="sr-only">{label} versus the previous period</span>
    </span>
  );
}

// A tiny trend line drawn by hand (no chart library), so the KPI row never waits on the
// lazily loaded chart code.
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) {
    return <div className={cn("h-8", className)} aria-hidden="true" />;
  }
  const width = 100;
  const height = 32;
  const pad = 2;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${height} ${line} ${width},${height}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("h-8 w-full overflow-visible", className)}
    >
      <polygon points={area} fill="currentColor" opacity="0.12" />
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const ICON_PATHS = {
  sales: (
    <>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 10v.01M18 14v.01" />
    </>
  ),
  orders: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  average: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
    </>
  ),
  cancelled: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </>
  ),
  online: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
  types: (
    <>
      <path d="M4 10h16l-1.5 9h-13z" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  cash: (
    <>
      <path d="M3 8h18v10H3z" />
      <path d="M7 8V6h10v2M12 11v4M10 12.5h4" />
    </>
  ),
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </>
  ),
  expenses: (
    <>
      <path d="M12 3v14M7 12l5 5 5-5" />
      <path d="M4 21h16" />
    </>
  ),
  net: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type KpiIconName = keyof typeof ICON_PATHS;

export function KpiIcon({ name }: { name: KpiIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}
