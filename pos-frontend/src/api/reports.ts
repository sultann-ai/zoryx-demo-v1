import type { BusinessDay } from "./businessDay";
import { apiClient } from "./client";

export interface DashboardTopItem {
  menuItemId: string;
  name: string;
  quantitySold: number;
}

export interface Dashboard {
  businessDay: BusinessDay;
  totalSales: string;
  orderCount: number;
  cancelledCount: number;
  // Orders waiting at reception (AWAITING_RECEPTION) — excluded from totalSales/orderCount,
  // same as cancelledCount.
  awaitingReceptionCount: number;
  // Accepted but not marked paid — never part of totalSales.
  unpaidCount: number;
  unpaidAmount: string;
  cancelledAfterPaymentCount: number;
  cancelledAfterPaymentAmount: string;
  topItems: DashboardTopItem[];
}

export interface DaySalesRow {
  businessDayId: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  totalSales: string;
  orderCount: number;
}

export interface MonthSalesRow {
  month: string;
  totalSales: string;
  orderCount: number;
  businessDayCount: number;
}

export type SalesReportRow = DaySalesRow | MonthSalesRow;

export type SalesReportGroupBy = "day" | "month";

export interface SalesReportParams {
  from: string;
  to: string;
  groupBy: SalesReportGroupBy;
}

export type ExportReportType = "daily" | "monthly";

export const reportsApi = {
  getDashboard: async (): Promise<Dashboard> => {
    const { data } = await apiClient.get<Dashboard>("/api/pos/reports/dashboard");
    return data;
  },
  getSalesReport: async (params: SalesReportParams): Promise<SalesReportRow[]> => {
    const { data } = await apiClient.get<SalesReportRow[]>("/api/pos/reports/sales", { params });
    return data;
  },
  exportReport: async (type: ExportReportType, businessDayId: string): Promise<Blob> => {
    const { data } = await apiClient.get<Blob>("/api/pos/reports/export", {
      params: { type, businessDayId },
      responseType: "blob",
    });
    return data;
  },
};
