import type { ReactNode } from "react";
import type { Analytics } from "../../api/analytics";
import { cn } from "../../components/ui/cn";
import { formatInt, formatPercent, formatRs, pctChange, toNumber } from "./format";
import { DeltaChip, KpiIcon, Skeleton, Sparkline } from "./parts";
import type { KpiIconName } from "./parts";
import { kpiSeries } from "./series";

// Static class names (Tailwind only emits what it can see in the source).
const TINTS = {
  1: { blob: "bg-chart-1-bg", icon: "bg-chart-1-bg text-chart-1", line: "text-chart-1" },
  2: { blob: "bg-chart-2-bg", icon: "bg-chart-2-bg text-chart-2", line: "text-chart-2" },
  3: { blob: "bg-chart-3-bg", icon: "bg-chart-3-bg text-chart-3", line: "text-chart-3" },
  4: { blob: "bg-chart-4-bg", icon: "bg-chart-4-bg text-chart-4", line: "text-chart-4" },
  5: { blob: "bg-chart-5-bg", icon: "bg-chart-5-bg text-chart-5", line: "text-chart-5" },
} as const;
type Tint = keyof typeof TINTS;

interface KpiCardProps {
  label: string;
  icon: KpiIconName;
  tint: Tint;
  value: string;
  detail?: ReactNode;
  delta?: ReactNode;
  spark?: number[];
  className?: string;
  children?: ReactNode;
}

function KpiCard({ label, icon, tint, value, detail, delta, spark, className, children }: KpiCardProps) {
  const t = TINTS[tint];
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-card border border-border bg-surface-raised p-4 shadow-sm",
        className,
      )}
    >
      {/* The subtle tinted accent in the corner. */}
      <div aria-hidden="true" className={cn("pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-60", t.blob)} />
      <div className="relative flex items-start justify-between gap-2">
        <span className="text-meta font-medium text-ink-muted">{label}</span>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-card", t.icon)}>
          <KpiIcon name={icon} />
        </span>
      </div>
      <div className="relative flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-title font-semibold tabular-nums lining-nums text-ink max-md:text-section">{value}</span>
        {delta}
      </div>
      {detail && <div className="relative text-meta text-ink-muted">{detail}</div>}
      {children}
      {spark && spark.length > 1 && <Sparkline values={spark} className={cn("relative mt-auto", t.line)} />}
    </div>
  );
}

export function KpiSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-card border border-border bg-surface-raised p-4 shadow-sm">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function KpiCards({ analytics }: { analytics: Analytics }) {
  const { totals, previousTotals, financials } = analytics;
  const spark = kpiSeries(analytics);
  const delta = (current: number, previous: number, goodWhen: "up" | "down" = "up") => (
    <DeltaChip pct={pctChange(current, previous)} current={current} goodWhen={goodWhen} />
  );
  const money = (key: "sales" | "averageOrderValue" | "cashSales" | "onlineSales" | "expenses" | "net") =>
    [toNumber(totals[key]), toNumber(previousTotals[key])] as const;

  const [sales, prevSales] = money("sales");
  const [avg, prevAvg] = money("averageOrderValue");
  const typeRows: { label: string; now: number; before: number }[] = [
    { label: "Dine-in", now: totals.dineIn, before: previousTotals.dineIn },
    { label: "Takeaway", now: totals.takeaway, before: previousTotals.takeaway },
    { label: "Delivery", now: totals.delivery, before: previousTotals.delivery },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 xl:grid-cols-4">
      <KpiCard label="Total sales" icon="sales" tint={1} value={formatRs(totals.sales)} delta={delta(sales, prevSales)} spark={spark.sales} className="col-span-2 md:col-span-1" />
      <KpiCard label="Orders" icon="orders" tint={2} value={formatInt(totals.orders)} delta={delta(totals.orders, previousTotals.orders)} spark={spark.orders} />
      <KpiCard label="Average order value" icon="average" tint={3} value={formatRs(totals.averageOrderValue)} delta={delta(avg, prevAvg)} spark={spark.average} />
      <KpiCard
        label="Cancelled orders"
        icon="cancelled"
        tint={5}
        value={formatInt(totals.cancelledCount)}
        delta={delta(totals.cancelledCount, previousTotals.cancelledCount, "down")}
        detail={
          <>
            {formatRs(totals.cancelledValue)} · {formatPercent(totals.cancellationRate)} of orders
            {totals.cancelledPaidCount > 0 && (
              <span className="block font-medium text-status-danger-text">
                {formatInt(totals.cancelledPaidCount)} after payment · {formatRs(totals.cancelledPaidValue)}
              </span>
            )}
          </>
        }
        spark={spark.cancelled}
      />
      <KpiCard
        label="Unpaid"
        icon="sales"
        tint={5}
        value={formatRs(totals.unpaidValue)}
        detail={<>{formatInt(totals.unpaidCount)} order(s) not marked paid · not in sales</>}
      />
      <KpiCard
        label="Online orders"
        icon="online"
        tint={4}
        value={formatInt(totals.onlineOrders)}
        delta={delta(totals.onlineOrders, previousTotals.onlineOrders)}
        detail={<>{formatPercent(totals.onlineShare)} of orders</>}
      />
      <KpiCard label="Order types" icon="types" tint={1} value={formatInt(totals.dineIn + totals.takeaway + totals.delivery)} className="col-span-2 md:col-span-1">
        <dl className="relative flex flex-col gap-1">
          {typeRows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-2">
              <dt className="text-meta text-ink-muted">{row.label}</dt>
              <dd className="flex items-center gap-2 text-body font-semibold tabular-nums text-ink">
                {formatInt(row.now)}
                <DeltaChip pct={pctChange(row.now, row.before)} current={row.now} className="px-1.5 py-0 text-[11px]" />
              </dd>
            </div>
          ))}
        </dl>
      </KpiCard>
      {financials && (
        <>
          <KpiCard label="Cash sales" icon="cash" tint={3} value={formatRs(totals.cashSales)} delta={delta(...money("cashSales"))} spark={spark.cashSales} />
          <KpiCard label="Online-payment sales" icon="card" tint={4} value={formatRs(totals.onlineSales)} delta={delta(...money("onlineSales"))} spark={spark.onlineSales} />
          <KpiCard
            label="Expenses"
            icon="expenses"
            tint={5}
            value={formatRs(totals.expenses)}
            delta={delta(...money("expenses"), "down")}
            detail="Vendor purchases"
            spark={spark.expenses}
          />
          <KpiCard label="Net amount" icon="net" tint={2} value={formatRs(totals.net)} delta={delta(...money("net"))} detail="Sales minus expenses" spark={spark.net} />
        </>
      )}
    </div>
  );
}
