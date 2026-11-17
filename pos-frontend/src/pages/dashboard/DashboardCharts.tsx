import { useId, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Analytics, AnalyticsBreakdownRow, AnalyticsCategory } from "../../api/analytics";
import {
  CHART_COLORS,
  CHART_MARGIN,
  ChartCard,
  GRID_PROPS,
  Segmented,
  TICK,
  TooltipBox,
  categoryAxis,
  countAxis,
  moneyAxis,
  tooltipFor,
  useAnimation,
} from "./chartKit";
import {
  WEEKDAY_FULL,
  WEEKDAY_LABELS,
  formatDateFull,
  formatDateShort,
  formatHour,
  formatHourSpan,
  formatInt,
  formatPercent,
  formatRange,
  formatRs,
  formatRsCompact,
  pctChange,
  toNumber,
} from "./format";
import { activeHourWindow, isSingleDay } from "./series";

const ACCENT = "var(--color-chart-1)";
const SECONDARY = "var(--color-chart-2)";
const MUTED_BAR = "var(--color-chart-1-bg)";

const TYPE_LABELS: Record<string, string> = { DINE_IN: "Dine-in", TAKEAWAY: "Takeaway", DELIVERY: "Delivery" };
const SOURCE_LABELS: Record<string, string> = { POS: "POS", ONLINE: "Online", PHONE: "Phone", ORDER_TAKER: "Waiter app" };
const PAYMENT_LABELS: Record<string, string> = { CASH: "Cash", ONLINE: "Online payment" };

const chartBox = "h-64 w-full md:h-72";

// ---------- a) Sales trend ----------

interface TrendPoint {
  label: string;
  title: string;
  value: number;
  previous: number;
  previousTitle: string;
  orders: number;
  previousOrders: number;
  sales: number;
  previousSales: number;
}

function SalesTrend({ analytics }: { analytics: Analytics }) {
  const [metric, setMetric] = useState<"sales" | "orders">("sales");
  const gradientId = useId();
  const animation = useAnimation();
  const hourly = isSingleDay(analytics);

  const points: TrendPoint[] = useMemo(() => {
    if (hourly) {
      const [first, last] = activeHourWindow(analytics.hourly, analytics.previousHourly);
      return analytics.hourly
        .filter((h) => h.hour >= first && h.hour <= last)
        .map((h) => {
          const before = analytics.previousHourly[h.hour];
          return {
            label: formatHour(h.hour),
            title: `${formatDateFull(analytics.range.from)} · ${formatHourSpan(h.hour)}`,
            sales: toNumber(h.sales),
            orders: h.orders,
            previousSales: toNumber(before?.sales),
            previousOrders: before?.orders ?? 0,
            previousTitle: `${formatDateFull(analytics.range.previousFrom)} · ${formatHourSpan(h.hour)}`,
            value: 0,
            previous: 0,
          };
        });
    }
    return analytics.daily.map((day, index) => {
      const before = analytics.previousDaily[index];
      return {
        label: formatDateShort(day.date),
        title: formatDateFull(day.date),
        sales: toNumber(day.sales),
        orders: day.orders,
        previousSales: toNumber(before?.sales),
        previousOrders: before?.orders ?? 0,
        previousTitle: before ? formatDateFull(before.date) : "",
        value: 0,
        previous: 0,
      };
    });
  }, [analytics, hourly]);

  const data = points.map((p) => ({
    ...p,
    value: metric === "sales" ? p.sales : p.orders,
    previous: metric === "sales" ? p.previousSales : p.previousOrders,
  }));
  const fmt = (n: number) => (metric === "sales" ? formatRs(n) : formatInt(n));
  const name = metric === "sales" ? "Sales" : "Orders";

  return (
    <ChartCard
      title={hourly ? `${name} by hour` : `${name} trend`}
      subtitle={`${formatRange(analytics.range.from, analytics.range.to)} · dashed line is ${formatRange(analytics.range.previousFrom, analytics.range.previousTo)}`}
      actions={
        <Segmented
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "sales", label: "Sales" },
            { value: "orders", label: "Orders" },
          ]}
        />
      }
      className="lg:col-span-6"
    >
      <div className={chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...categoryAxis} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...(metric === "sales" ? moneyAxis : countAxis)} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--color-ink-muted)", strokeDasharray: "3 3" }}
              content={tooltipFor<(typeof data)[number]>((p) => (
                <TooltipBox
                  title={p.title}
                  rows={[
                    { label: name, value: fmt(p.value), color: ACCENT, change: { pct: pctChange(p.value, p.previous), current: p.value } },
                    { label: "Previous", value: fmt(p.previous), color: "var(--color-ink-muted)" },
                    ...(metric === "sales"
                      ? [{ label: "Orders", value: formatInt(p.orders) }]
                      : [{ label: "Sales", value: formatRs(p.sales) }]),
                  ]}
                  footer={p.previousTitle ? `Previous: ${p.previousTitle}` : undefined}
                />
              ))}
            />
            <Area type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2.5} fill={`url(#${gradientId})`} dot={data.length <= 31 ? { r: 3, fill: ACCENT, strokeWidth: 0 } : false} activeDot={{ r: 5 }} {...animation} />
            <Line type="monotone" dataKey="previous" stroke="var(--color-ink-muted)" strokeWidth={1.75} strokeDasharray="5 4" dot={false} activeDot={false} {...animation} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ---------- b) Sales by hour of day ----------

function HourOfDay({ analytics }: { analytics: Analytics }) {
  const animation = useAnimation();
  const [first, last] = activeHourWindow(analytics.hourly, analytics.previousHourly);
  const rows = analytics.hourly.filter((h) => h.hour >= first && h.hour <= last);
  const busiest = rows.reduce((best, h) => (toNumber(h.sales) > toNumber(best?.sales) ? h : best), rows[0]);
  const data = rows.map((h) => {
    const before = analytics.previousHourly[h.hour];
    return {
      label: formatHour(h.hour),
      title: formatHourSpan(h.hour),
      sales: toNumber(h.sales),
      orders: h.orders,
      previousSales: toNumber(before?.sales),
      fill: h.hour === busiest?.hour && toNumber(h.sales) > 0 ? ACCENT : SECONDARY,
    };
  });
  return (
    <ChartCard
      title="Sales by hour of day"
      subtitle={busiest && toNumber(busiest.sales) > 0 ? `Busiest: ${formatHourSpan(busiest.hour)} · ${formatRs(busiest.sales)}` : "Pakistan time"}
      className="lg:col-span-3"
    >
      <div className={chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...categoryAxis} interval="preserveStartEnd" minTickGap={16} />
            <YAxis {...moneyAxis} />
            <Tooltip
              cursor={{ fill: "var(--color-surface)" }}
              content={tooltipFor<(typeof data)[number]>((p) => (
                <TooltipBox
                  title={`${formatRange(analytics.range.from, analytics.range.to)} · ${p.title}`}
                  rows={[
                    { label: "Sales", value: formatRs(p.sales), color: p.fill, change: { pct: pctChange(p.sales, p.previousSales), current: p.sales } },
                    { label: "Orders", value: formatInt(p.orders) },
                  ]}
                  footer={`Previous period: ${formatRs(p.previousSales)}`}
                />
              ))}
            />
            <Bar dataKey="sales" radius={[4, 4, 0, 0]} maxBarSize={32} {...animation} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ---------- c) Sales by day of the week ----------

function WeekdayAverage({ analytics }: { analytics: Analytics }) {
  const animation = useAnimation();
  const rows = analytics.weekday.rows;
  const best = rows.reduce((top, row) => (toNumber(row.averageSales) > toNumber(top?.averageSales) ? row : top), rows[0]);
  const data = rows.map((row) => ({
    label: WEEKDAY_LABELS[row.weekday - 1] ?? "",
    title: WEEKDAY_FULL[row.weekday - 1] ?? "",
    average: toNumber(row.averageSales),
    days: row.businessDays,
    fill: row.weekday === best?.weekday && toNumber(row.averageSales) > 0 ? ACCENT : SECONDARY,
  }));
  return (
    <ChartCard
      title="Average sales by day of week"
      subtitle={`Per business day, ${formatRange(analytics.weekday.from, analytics.weekday.to)}${best && toNumber(best.averageSales) > 0 ? ` · best: ${WEEKDAY_FULL[best.weekday - 1]}` : ""}`}
      className="lg:col-span-3"
    >
      <div className={chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...categoryAxis} />
            <YAxis {...moneyAxis} />
            <Tooltip
              cursor={{ fill: "var(--color-surface)" }}
              content={tooltipFor<(typeof data)[number]>((p) => (
                <TooltipBox
                  title={p.title}
                  rows={[
                    { label: "Average sales", value: formatRs(p.average), color: p.fill },
                    { label: "Business days", value: formatInt(p.days) },
                  ]}
                />
              ))}
            />
            <Bar dataKey="average" radius={[4, 4, 0, 0]} maxBarSize={44} {...animation} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ---------- d) Weekly view (always the last 8 weeks) ----------

function WeeklyView({ analytics }: { analytics: Analytics }) {
  const animation = useAnimation();
  const weeks = analytics.weekly;
  const latest = weeks[weeks.length - 1];
  const data = weeks.map((week, index) => ({
    label: formatDateShort(week.weekStart),
    title: `${formatDateShort(week.weekStart)} – ${formatDateShort(week.weekEnd)}${index === weeks.length - 1 ? " (so far)" : ""}`,
    revenue: toNumber(week.revenue),
    orders: week.orders,
    average: toNumber(week.averageOrderValue),
    change: week.revenueChangePct,
    fill: index === weeks.length - 1 ? MUTED_BAR : ACCENT,
  }));
  return (
    <ChartCard
      title="Last 8 weeks"
      subtitle={
        latest?.revenueChangePct != null
          ? `This week so far is ${latest.revenueChangePct >= 0 ? "up" : "down"} ${Math.abs(Math.round(latest.revenueChangePct))}% on last week · weeks run Monday to Sunday`
          : "Weeks run Monday to Sunday"
      }
      className="lg:col-span-6"
    >
      <div className={chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...categoryAxis} />
            <YAxis {...moneyAxis} />
            <Tooltip
              cursor={{ fill: "var(--color-surface)" }}
              content={tooltipFor<(typeof data)[number]>((p) => (
                <TooltipBox
                  title={`Week of ${p.title}`}
                  rows={[
                    { label: "Revenue", value: formatRs(p.revenue), color: ACCENT, change: { pct: p.change, current: p.revenue } },
                    { label: "Orders", value: formatInt(p.orders) },
                    { label: "Avg order", value: formatRs(p.average) },
                  ]}
                  footer="Change is versus the week before"
                />
              ))}
            />
            <Bar dataKey="revenue" radius={[4, 4, 0, 0]} maxBarSize={56} {...animation} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ---------- e) Donuts ----------

function Donut({ title, rows, labels, span }: { title: string; rows: AnalyticsBreakdownRow[]; labels: Record<string, string>; span: string }) {
  const animation = useAnimation();
  const total = rows.reduce((sum, row) => sum + row.orders, 0);
  const data = rows.map((row, index) => ({
    ...row,
    name: labels[row.key] ?? row.key,
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }));
  const drawn = data.filter((row) => row.orders > 0);
  return (
    <ChartCard title={title} className={span}>
      {total === 0 ? (
        <p className="py-10 text-center text-body text-ink-muted">No orders in this period.</p>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <div className="relative h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip
                  content={tooltipFor<(typeof data)[number]>((p) => (
                    <TooltipBox
                      title={p.name}
                      rows={[
                        { label: "Orders", value: formatInt(p.orders), color: p.fill, change: { pct: pctChange(p.orders, p.previousOrders), current: p.orders } },
                        { label: "Sales", value: formatRs(p.sales) },
                        { label: "Share", value: formatPercent(p.orders / total) },
                      ]}
                      footer={`Previous period: ${formatInt(p.previousOrders)} orders`}
                    />
                  ))}
                />
                <Pie data={drawn} dataKey="orders" nameKey="name" innerRadius={46} outerRadius={72} paddingAngle={drawn.length > 1 ? 2 : 0} stroke="var(--color-surface-raised)" strokeWidth={2} {...animation} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-numeric font-semibold tabular-nums text-ink">{formatInt(total)}</span>
              <span className="text-meta text-ink-muted">orders</span>
            </div>
          </div>
          <ul className="flex w-full min-w-0 list-none flex-col gap-1.5">
            {data.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-2 text-meta">
                <span className="flex min-w-0 items-center gap-2 text-ink">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.fill }} />
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {formatInt(row.orders)} · {formatPercent(row.orders / total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}

// ---------- f) Categories and top items ----------

interface BarRow {
  name: string;
  value: number;
  tipTitle: string;
  rows: { label: string; value: string; change?: { pct: number | null; current: number } }[];
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function HorizontalBars({ data, color, format, empty }: { data: BarRow[]; color: string; format: (n: number) => string; empty: string }) {
  const animation = useAnimation();
  if (data.length === 0) {
    return <p className="py-10 text-center text-body text-ink-muted">{empty}</p>;
  }
  return (
    <div style={{ height: Math.max(data.length * 34 + 16, 140) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />
          <XAxis type="number" tick={TICK} axisLine={false} tickLine={false} tickFormatter={(v: number) => (format(1) === formatRs(1) ? formatRsCompact(v) : formatInt(v))} allowDecimals={false} />
          <YAxis type="category" dataKey="name" tick={TICK} axisLine={false} tickLine={false} width={104} tickFormatter={(v: string) => truncate(v, 16)} interval={0} />
          <Tooltip
            cursor={{ fill: "var(--color-surface)" }}
            content={tooltipFor<BarRow>((p) => (
              <TooltipBox
                title={p.tipTitle}
                rows={p.rows.map((row, index) => (index === 0 ? { ...row, color } : row))}
                footer="Change is versus the previous period"
              />
            ))}
          />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} barSize={18} {...animation} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function categoryRows(categories: AnalyticsCategory[]): BarRow[] {
  return categories.slice(0, 10).map((c) => ({
    name: c.name,
    value: toNumber(c.revenue),
    tipTitle: c.name,
    rows: [
      { label: "Sales", value: formatRs(c.revenue), change: { pct: pctChange(toNumber(c.revenue), toNumber(c.previousRevenue)), current: toNumber(c.revenue) } },
      { label: "Quantity", value: formatInt(c.quantity) },
      { label: "Previous", value: formatRs(c.previousRevenue) },
    ],
  }));
}

function Categories({ analytics }: { analytics: Analytics }) {
  return (
    <ChartCard title="Sales by category" subtitle="Item sales; deals are their own bar" className="lg:col-span-3">
      <HorizontalBars data={categoryRows(analytics.categories)} color={ACCENT} format={formatRs} empty="No item sales in this period." />
    </ChartCard>
  );
}

function TopItems({ analytics }: { analytics: Analytics }) {
  const [metric, setMetric] = useState<"revenue" | "quantity">("revenue");
  const items = metric === "revenue" ? analytics.topItemsByRevenue : analytics.topItemsByQuantity;
  const data: BarRow[] = items.map((item) => {
    const now = metric === "revenue" ? toNumber(item.revenue) : item.quantity;
    const before = metric === "revenue" ? toNumber(item.previousRevenue) : item.previousQuantity;
    return {
      name: item.name,
      value: now,
      tipTitle: item.name,
      rows: [
        { label: metric === "revenue" ? "Sales" : "Quantity", value: metric === "revenue" ? formatRs(now) : formatInt(now), change: { pct: pctChange(now, before), current: now } },
        { label: metric === "revenue" ? "Quantity" : "Sales", value: metric === "revenue" ? formatInt(item.quantity) : formatRs(item.revenue) },
        { label: "Previous", value: metric === "revenue" ? formatRs(before) : formatInt(before) },
      ],
    };
  });
  return (
    <ChartCard
      title="Top 10 items"
      subtitle={metric === "quantity" ? "Counts every item made, including those inside deals" : "Revenue from items sold on their own"}
      actions={
        <Segmented
          label="Rank by"
          value={metric}
          onChange={setMetric}
          options={[
            { value: "revenue", label: "Revenue" },
            { value: "quantity", label: "Quantity" },
          ]}
        />
      }
      className="lg:col-span-3"
    >
      <HorizontalBars data={data} color={SECONDARY} format={metric === "revenue" ? formatRs : formatInt} empty="No items sold in this period." />
    </ChartCard>
  );
}

// ---------- g) Cancelled orders ----------

function CancelledTrend({ analytics }: { analytics: Analytics }) {
  const animation = useAnimation();
  const { totals, previousTotals, range } = analytics;
  const single = isSingleDay(analytics);
  const data = single
    ? [
        { label: "Previous", title: formatRange(range.previousFrom, range.previousTo), count: previousTotals.cancelledCount, previous: 0, value: previousTotals.cancelledValue, fill: "var(--color-border)" },
        { label: "This period", title: formatRange(range.from, range.to), count: totals.cancelledCount, previous: previousTotals.cancelledCount, value: totals.cancelledValue, fill: "var(--color-status-danger)" },
      ]
    : analytics.daily.map((day, index) => {
        const before = analytics.previousDaily[index];
        return { label: formatDateShort(day.date), title: formatDateFull(day.date), count: day.cancelledCount, previous: before?.cancelledCount ?? 0, value: day.cancelledValue, fill: "var(--color-status-danger)" };
      });
  return (
    <ChartCard title="Cancelled orders" subtitle={single ? "Compared with the previous day" : "Per day · dashed line is the previous period"} className="lg:col-span-3">
      <div className={chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...categoryAxis} interval="preserveStartEnd" minTickGap={24} />
            <YAxis {...countAxis} domain={[0, (max: number) => Math.max(max, 3)]} />
            <Tooltip
              cursor={{ fill: "var(--color-surface)" }}
              content={tooltipFor<(typeof data)[number]>((p) => (
                <TooltipBox
                  title={p.title}
                  rows={[
                    { label: "Cancelled", value: formatInt(p.count), color: "var(--color-status-danger)", change: single ? undefined : { pct: pctChange(p.count, p.previous), current: p.count, goodWhen: "down" } },
                    { label: "Value", value: formatRs(p.value) },
                    ...(single ? [] : [{ label: "Previous", value: formatInt(p.previous) }]),
                  ]}
                />
              ))}
            />
            <Bar dataKey="count" fill="var(--color-status-danger)" radius={[4, 4, 0, 0]} maxBarSize={single ? 72 : 28} {...animation} />
            {!single && <Line type="monotone" dataKey="previous" stroke="var(--color-ink-muted)" strokeWidth={1.75} strokeDasharray="5 4" dot={false} activeDot={false} {...animation} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function CancellationReasons({ analytics }: { analytics: Analytics }) {
  const data: BarRow[] = analytics.cancelledReasons.map((reason) => ({
    name: reason.reason,
    value: reason.count,
    tipTitle: reason.reason,
    rows: [
      { label: "Orders", value: formatInt(reason.count) },
      { label: "Value", value: formatRs(reason.value) },
    ],
  }));
  return (
    <ChartCard title="Top cancellation reasons" className="lg:col-span-3">
      <HorizontalBars data={data} color="var(--color-status-danger)" format={formatInt} empty="No cancelled orders in this period." />
    </ChartCard>
  );
}

// ---------- h) Sales vs expenses (financial roles only) ----------

function SalesVsExpenses({ analytics }: { analytics: Analytics }) {
  const animation = useAnimation();
  const data = analytics.daily.map((day) => ({
    label: formatDateShort(day.date),
    title: formatDateFull(day.date),
    sales: toNumber(day.sales),
    expenses: toNumber(day.expenses),
    net: toNumber(day.net),
  }));
  return (
    <ChartCard title="Sales vs expenses" subtitle="Expenses are vendor purchases; net is sales minus expenses" className="lg:col-span-6">
      <div className={chartBox}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis dataKey="label" {...categoryAxis} interval="preserveStartEnd" minTickGap={28} />
            <YAxis {...moneyAxis} />
            <Legend verticalAlign="top" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--color-ink-muted)" }} />
            <Tooltip
              cursor={{ fill: "var(--color-surface)" }}
              content={tooltipFor<(typeof data)[number]>((p) => (
                <TooltipBox
                  title={p.title}
                  rows={[
                    { label: "Sales", value: formatRs(p.sales), color: ACCENT },
                    { label: "Expenses", value: formatRs(p.expenses), color: "var(--color-chart-5)" },
                    { label: "Net", value: formatRs(p.net), color: SECONDARY },
                  ]}
                />
              ))}
            />
            <Bar dataKey="sales" name="Sales" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={24} {...animation} />
            <Bar dataKey="expenses" name="Expenses" fill="var(--color-chart-5)" radius={[4, 4, 0, 0]} maxBarSize={24} {...animation} />
            <Line type="monotone" dataKey="net" name="Net" stroke={SECONDARY} strokeWidth={2.25} dot={data.length <= 31 ? { r: 3, fill: SECONDARY, strokeWidth: 0 } : false} {...animation} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// The whole chart section; loaded lazily so the KPI row never waits on Recharts.
export default function DashboardCharts({ analytics, weeklyOnly = false }: { analytics: Analytics; weeklyOnly?: boolean }) {
  if (weeklyOnly) {
    // An empty period still shows the always-visible 8-week view.
    return (
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
        <WeeklyView analytics={analytics} />
      </div>
    );
  }
  // Two donuts share the row when there is no payment-method split (roles without financials).
  const span = analytics.breakdowns.payment ? "lg:col-span-2" : "lg:col-span-3";
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-6">
      <SalesTrend analytics={analytics} />
      <HourOfDay analytics={analytics} />
      <WeekdayAverage analytics={analytics} />
      <WeeklyView analytics={analytics} />
      <Donut title="Order type" rows={analytics.breakdowns.orderType} labels={TYPE_LABELS} span={span} />
      <Donut title="POS vs online" rows={analytics.breakdowns.source} labels={SOURCE_LABELS} span={span} />
      {analytics.breakdowns.payment && <Donut title="Payment method" rows={analytics.breakdowns.payment} labels={PAYMENT_LABELS} span={span} />}
      <Categories analytics={analytics} />
      <TopItems analytics={analytics} />
      <CancelledTrend analytics={analytics} />
      <CancellationReasons analytics={analytics} />
      {analytics.financials && <SalesVsExpenses analytics={analytics} />}
    </div>
  );
}
