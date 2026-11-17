import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Analytics, AnalyticsDay } from "../../api/analytics";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../components/ui";
import { cn } from "../../components/ui/cn";
import { DeltaChip } from "./parts";
import { formatChange, formatDateFull, formatDateShort, formatInt, formatRs, toNumber } from "./format";

type SortKey = "date" | "orders" | "sales" | "average" | "cancelled" | "cash" | "online" | "expenses" | "net";

const STICKY = "sticky left-0 z-10 bg-surface-raised";

function value(day: AnalyticsDay, key: SortKey): number | string {
  switch (key) {
    case "date":
      return day.date;
    case "orders":
      return day.orders;
    case "sales":
      return toNumber(day.sales);
    case "average":
      return toNumber(day.averageOrderValue);
    case "cancelled":
      return day.cancelledCount;
    case "cash":
      return toNumber(day.cashSales);
    case "online":
      return toNumber(day.onlineSales);
    case "expenses":
      return toNumber(day.expenses);
    case "net":
      return toNumber(day.net);
  }
}

function SortHeader({
  label,
  sortKey,
  active,
  direction,
  onSort,
  sticky,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  direction: "asc" | "desc";
  onSort: (key: SortKey) => void;
  sticky?: boolean;
  align?: "left" | "right";
}) {
  const isActive = active === sortKey;
  return (
    <TableHeaderCell
      aria-sort={isActive ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={cn("whitespace-nowrap", align === "right" && "text-right", sticky && cn(STICKY, "bg-surface-raised"))}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded-card px-1 py-1 font-semibold hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          isActive && "text-ink",
        )}
      >
        {label}
        <span aria-hidden="true" className="text-[10px]">
          {isActive ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </TableHeaderCell>
  );
}

// Daily breakdown for the selected range, one row per calendar date (a date with no business
// day shows zeros), sortable, with a totals row. Each row opens that business day's orders.
export function DailyTable({ analytics }: { analytics: Analytics }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const { financials, totals } = analytics;

  const rows = useMemo(() => {
    const sorted = [...analytics.daily].sort((a, b) => {
      const x = value(a, sortKey);
      const y = value(b, sortKey);
      const order = typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return direction === "asc" ? order : -order;
    });
    return sorted;
  }, [analytics.daily, sortKey, direction]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setDirection(direction === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setDirection(key === "date" ? "desc" : "desc");
    }
  }
  const header = (label: string, key: SortKey, extra?: { sticky?: boolean; align?: "left" | "right" }) => (
    <SortHeader label={label} sortKey={key} active={sortKey} direction={direction} onSort={onSort} {...extra} />
  );
  const num = "text-right tabular-nums whitespace-nowrap";

  return (
    <Table mobileLayout="scroll" className="max-h-[32rem] overflow-y-auto shadow-sm">
      <TableHead>
        <TableRow>
          {header("Date", "date", { sticky: true, align: "left" })}
          {header("Orders", "orders")}
          {header("Sales", "sales")}
          {header("Avg order", "average")}
          {header("Cancelled", "cancelled")}
          {financials && header("Cash", "cash")}
          {financials && header("Online", "online")}
          {financials && header("Expenses", "expenses")}
          {financials && header("Net", "net")}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((day) => (
          <TableRow key={day.date} className={day.businessDayIds.length === 0 ? "text-ink-muted" : undefined}>
            <TableCell className={cn(STICKY, "whitespace-nowrap font-medium")}>
              {day.businessDayIds[0] ? (
                <Link
                  to={`/orders?businessDayId=${day.businessDayIds[0]}`}
                  className="text-accent no-underline hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title={day.businessDayIds.length > 1 ? "Opens the first of this date's business days" : "Open this business day's orders"}
                >
                  {formatDateFull(day.date)}
                </Link>
              ) : (
                <span title="No business day">{formatDateFull(day.date)}</span>
              )}
            </TableCell>
            <TableCell className={num}>{formatInt(day.orders)}</TableCell>
            <TableCell className={num}>{formatRs(day.sales)}</TableCell>
            <TableCell className={num}>{formatRs(day.averageOrderValue)}</TableCell>
            <TableCell className={num}>{formatInt(day.cancelledCount)}</TableCell>
            {financials && <TableCell className={num}>{formatRs(day.cashSales)}</TableCell>}
            {financials && <TableCell className={num}>{formatRs(day.onlineSales)}</TableCell>}
            {financials && <TableCell className={num}>{formatRs(day.expenses)}</TableCell>}
            {financials && <TableCell className={cn(num, toNumber(day.net) < 0 && "text-status-danger-text")}>{formatRs(day.net)}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
      <tfoot>
        <tr role="row" className="border-t-2 border-border font-semibold">
          <td role="cell" className={cn("px-3 py-2", STICKY, "bg-surface")}>Total</td>
          <td role="cell" className={cn("px-3 py-2 bg-surface", num)}>{formatInt(totals.orders)}</td>
          <td role="cell" className={cn("px-3 py-2 bg-surface", num)}>{formatRs(totals.sales)}</td>
          <td role="cell" className={cn("px-3 py-2 bg-surface", num)}>{formatRs(totals.averageOrderValue)}</td>
          <td role="cell" className={cn("px-3 py-2 bg-surface", num)}>{formatInt(totals.cancelledCount)}</td>
          {financials && <td role="cell" className={cn("px-3 py-2 bg-surface", num)}>{formatRs(totals.cashSales)}</td>}
          {financials && <td role="cell" className={cn("px-3 py-2 bg-surface", num)}>{formatRs(totals.onlineSales)}</td>}
          {financials && <td role="cell" className={cn("px-3 py-2 bg-surface", num)}>{formatRs(totals.expenses)}</td>}
          {financials && <td role="cell" className={cn("px-3 py-2 bg-surface", num)}>{formatRs(totals.net)}</td>}
        </tr>
      </tfoot>
    </Table>
  );
}

export function WeeklyTable({ analytics }: { analytics: Analytics }) {
  const weeks = [...analytics.weekly].reverse();
  const num = "text-right tabular-nums whitespace-nowrap";
  return (
    <Table mobileLayout="scroll" className="shadow-sm">
      <TableHead>
        <TableRow>
          <TableHeaderCell className={cn(STICKY, "whitespace-nowrap")}>Week (Mon – Sun)</TableHeaderCell>
          <TableHeaderCell className="text-right">Revenue</TableHeaderCell>
          <TableHeaderCell className="text-right">Orders</TableHeaderCell>
          <TableHeaderCell className="whitespace-nowrap text-right">Avg order</TableHeaderCell>
          <TableHeaderCell className="whitespace-nowrap text-right">vs prior week</TableHeaderCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {weeks.map((week, index) => (
          <TableRow key={week.weekStart}>
            <TableCell className={cn(STICKY, "whitespace-nowrap font-medium")}>
              {formatDateShort(week.weekStart)} – {formatDateShort(week.weekEnd)}
              {index === 0 && <span className="ml-2 text-meta font-normal text-ink-muted">so far</span>}
            </TableCell>
            <TableCell className={num}>{formatRs(week.revenue)}</TableCell>
            <TableCell className={num}>{formatInt(week.orders)}</TableCell>
            <TableCell className={num}>{formatRs(week.averageOrderValue)}</TableCell>
            <TableCell className="text-right">
              {week.revenueChangePct === null ? (
                <span className="text-ink-muted" aria-label="Nothing to compare with">
                  {formatChange(null)}
                </span>
              ) : (
                <DeltaChip pct={week.revenueChangePct} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
