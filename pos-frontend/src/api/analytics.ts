import { apiClient } from "./client";

export type DashboardPeriod = "today" | "yesterday" | "last7" | "last30" | "month" | "custom";

// Mirrors backend/src/modules/reports/analytics.service.ts. Money is a string ("1500.00").
export interface AnalyticsRange {
  from: string;
  to: string;
  days: number;
  previousFrom: string;
  previousTo: string;
}

export interface AnalyticsTotals {
  sales: string;
  orders: number;
  averageOrderValue: string;
  cancelledCount: number;
  cancelledValue: string;
  cancellationRate: number;
  // Cancelled orders that had been paid (part of cancelledCount/Value).
  cancelledPaidCount: number;
  cancelledPaidValue: string;
  // Accepted, not cancelled, not paid yet — shown on its own, never part of sales.
  unpaidCount: number;
  unpaidValue: string;
  onlineOrders: number;
  onlineShare: number;
  dineIn: number;
  takeaway: number;
  delivery: number;
  businessDays: number;
  // Present only for roles allowed to see financial figures.
  cashSales?: string;
  onlineSales?: string;
  expenses?: string;
  net?: string;
}

export interface AnalyticsDay {
  date: string;
  businessDayIds: string[];
  sales: string;
  orders: number;
  averageOrderValue: string;
  cancelledCount: number;
  cancelledValue: string;
  cashSales?: string;
  onlineSales?: string;
  expenses?: string;
  net?: string;
}

export interface AnalyticsHour {
  hour: number;
  sales: string;
  orders: number;
}

export interface AnalyticsBreakdownRow {
  key: string;
  orders: number;
  sales: string;
  previousOrders: number;
  previousSales: string;
}

export interface AnalyticsCategory {
  name: string;
  revenue: string;
  quantity: number;
  previousRevenue: string;
  previousQuantity: number;
}

export interface AnalyticsItem extends AnalyticsCategory {
  menuItemId: string;
}

export interface AnalyticsWeek {
  weekStart: string;
  weekEnd: string;
  revenue: string;
  orders: number;
  averageOrderValue: string;
  revenueChangePct: number | null;
}

export interface Analytics {
  period: DashboardPeriod;
  range: AnalyticsRange;
  generatedAt: string;
  activeBusinessDay: { id: string; label: string } | null;
  financials: boolean;
  totals: AnalyticsTotals;
  previousTotals: AnalyticsTotals;
  daily: AnalyticsDay[];
  previousDaily: AnalyticsDay[];
  hourly: AnalyticsHour[];
  previousHourly: AnalyticsHour[];
  breakdowns: {
    orderType: AnalyticsBreakdownRow[];
    source: AnalyticsBreakdownRow[];
    payment?: AnalyticsBreakdownRow[];
  };
  categories: AnalyticsCategory[];
  topItemsByRevenue: AnalyticsItem[];
  topItemsByQuantity: AnalyticsItem[];
  cancelledReasons: { reason: string; count: number; value: string }[];
  // Discounts on the period's sales, per staff member who gave them (staffId null: not recorded).
  discounts: {
    total: string;
    count: number;
    byStaff: { staffId: string | null; name: string; count: number; amount: string }[];
  };
  weekly: AnalyticsWeek[];
  weekday: { from: string; to: string; rows: { weekday: number; averageSales: string; businessDays: number }[] };
}

export interface AnalyticsQuery {
  period: DashboardPeriod;
  from?: string;
  to?: string;
}

export const analyticsApi = {
  get: async (query: AnalyticsQuery): Promise<Analytics> => {
    const { data } = await apiClient.get<Analytics>("/api/pos/reports/analytics", { params: query });
    return data;
  },
};
