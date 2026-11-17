import type { Analytics, AnalyticsHour } from "../../api/analytics";
import { toNumber } from "./format";

// A one-day period (Today, Yesterday, a custom single date) is shown by hour; anything longer
// by day.
export function isSingleDay(analytics: Analytics): boolean {
  return analytics.range.days === 1;
}

// Hours from the first to the last one with any activity in either series (at least six hours
// wide), so a short trading day does not leave a field of empty axis under the chart.
export function activeHourWindow(...series: AnalyticsHour[][]): [number, number] {
  let first = 24;
  let last = -1;
  for (const hours of series) {
    for (const point of hours) {
      if (point.orders > 0 || toNumber(point.sales) > 0) {
        first = Math.min(first, point.hour);
        last = Math.max(last, point.hour);
      }
    }
  }
  if (last < 0) return [10, 22];
  while (last - first + 1 < 6) {
    if (first > 0) first -= 1;
    if (last - first + 1 < 6 && last < 23) last += 1;
  }
  return [first, last];
}

export interface KpiSeries {
  sales: number[];
  orders: number[];
  average: number[];
  cancelled: number[];
  onlineOrders: number[];
  cashSales: number[];
  onlineSales: number[];
  expenses: number[];
  net: number[];
}

// The tiny sparkline behind each KPI card: the period's daily series, or its hourly one for a
// single day. Per-hour data only exists for sales and orders, so the other KPIs have no
// sparkline on a single day.
export function kpiSeries(analytics: Analytics): KpiSeries {
  if (isSingleDay(analytics)) {
    const [first, last] = activeHourWindow(analytics.hourly);
    const hours = analytics.hourly.filter((point) => point.hour >= first && point.hour <= last);
    return {
      sales: hours.map((point) => toNumber(point.sales)),
      orders: hours.map((point) => point.orders),
      average: hours.map((point) => (point.orders > 0 ? toNumber(point.sales) / point.orders : 0)),
      cancelled: [],
      onlineOrders: [],
      cashSales: [],
      onlineSales: [],
      expenses: [],
      net: [],
    };
  }
  const days = analytics.daily;
  return {
    sales: days.map((day) => toNumber(day.sales)),
    orders: days.map((day) => day.orders),
    average: days.map((day) => toNumber(day.averageOrderValue)),
    cancelled: days.map((day) => day.cancelledCount),
    onlineOrders: [],
    cashSales: days.map((day) => toNumber(day.cashSales)),
    onlineSales: days.map((day) => toNumber(day.onlineSales)),
    expenses: days.map((day) => toNumber(day.expenses)),
    net: days.map((day) => toNumber(day.net)),
  };
}
