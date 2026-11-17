import type { ReactNode } from "react";
import type { Analytics } from "../../api/analytics";
import { WEEKDAY_FULL, formatChange, formatDateFull, formatHourSpan, formatInt, formatRs, pctChange, toNumber } from "./format";

interface Insight {
  label: string;
  headline: ReactNode;
  detail: string;
}

// Plain calculations over the numbers already on the page. An insight with nothing to say
// (an empty period, no previous figure) is left out rather than invented.
export function buildInsights(analytics: Analytics): Insight[] {
  const insights: Insight[] = [];
  const { totals, previousTotals } = analytics;

  const days = analytics.daily.filter((day) => day.orders > 0);
  const bestDay = days.reduce<(typeof days)[number] | undefined>((best, day) => (!best || toNumber(day.sales) > toNumber(best.sales) ? day : best), undefined);
  if (bestDay && analytics.range.days > 1) {
    insights.push({ label: "Best day", headline: formatDateFull(bestDay.date), detail: `${formatRs(bestDay.sales)} from ${formatInt(bestDay.orders)} orders` });
  }

  const busiest = analytics.hourly.reduce<(typeof analytics.hourly)[number] | undefined>(
    (best, hour) => (hour.orders > (best?.orders ?? 0) ? hour : best),
    undefined,
  );
  if (busiest && busiest.orders > 0) {
    insights.push({ label: "Busiest hour", headline: formatHourSpan(busiest.hour), detail: `${formatInt(busiest.orders)} orders · ${formatRs(busiest.sales)}` });
  }

  const topItem = analytics.topItemsByQuantity[0];
  if (topItem && topItem.quantity > 0) {
    insights.push({ label: "Best-selling item", headline: topItem.name, detail: `${formatInt(topItem.quantity)} sold · ${formatRs(topItem.revenue)}` });
  }

  const bestWeekday = analytics.weekday.rows.reduce<(typeof analytics.weekday.rows)[number] | undefined>(
    (best, row) => (toNumber(row.averageSales) > toNumber(best?.averageSales) ? row : best),
    undefined,
  );
  if (bestWeekday && toNumber(bestWeekday.averageSales) > 0 && analytics.range.days > 1) {
    insights.push({ label: "Strongest weekday", headline: WEEKDAY_FULL[bestWeekday.weekday - 1] ?? "", detail: `${formatRs(bestWeekday.averageSales)} on average` });
  }

  // Largest percentage move among the headline figures, for a period that has a previous one.
  const candidates = [
    { name: "Sales", now: toNumber(totals.sales), before: toNumber(previousTotals.sales), money: true },
    { name: "Orders", now: totals.orders, before: previousTotals.orders, money: false },
    { name: "Average order value", now: toNumber(totals.averageOrderValue), before: toNumber(previousTotals.averageOrderValue), money: true },
    { name: "Cancelled orders", now: totals.cancelledCount, before: previousTotals.cancelledCount, money: false },
  ]
    .map((c) => ({ ...c, pct: pctChange(c.now, c.before) }))
    .filter((c): c is typeof c & { pct: number } => c.pct !== null);
  const biggest = candidates.reduce<(typeof candidates)[number] | undefined>((best, c) => (!best || Math.abs(c.pct) > Math.abs(best.pct) ? c : best), undefined);
  if (biggest && biggest.pct !== 0) {
    const fmt = (n: number) => (biggest.money ? formatRs(n) : formatInt(n));
    insights.push({
      label: "Biggest change",
      headline: `${biggest.name} ${formatChange(biggest.pct)}`,
      detail: `${fmt(biggest.before)} before, ${fmt(biggest.now)} now`,
    });
  }

  return insights;
}

export function Insights({ analytics }: { analytics: Analytics }) {
  const insights = buildInsights(analytics);
  if (insights.length === 0) return null;
  return (
    <ul className="grid list-none grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]">
      {insights.map((insight) => (
        <li key={insight.label} className="min-w-0 rounded-card border border-border bg-surface-raised p-4 shadow-sm">
          <div className="text-meta font-medium text-ink-muted">{insight.label}</div>
          <div className="mt-1 truncate text-card-head font-semibold text-ink" title={typeof insight.headline === "string" ? insight.headline : undefined}>
            {insight.headline}
          </div>
          <div className="text-meta text-ink-muted">{insight.detail}</div>
        </li>
      ))}
    </ul>
  );
}
