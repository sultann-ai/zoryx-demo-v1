import { useQuery } from "@tanstack/react-query";
import type { SalesReportParams } from "../api/reports";
import { reportsApi } from "../api/reports";

// params is null until the query form is submitted, so the report doesn't
// fetch on mount with some arbitrary default range.
export function useSalesReport(params: SalesReportParams | null) {
  return useQuery({
    queryKey: ["sales-report", params],
    queryFn: () => reportsApi.getSalesReport(params as SalesReportParams),
    enabled: params !== null,
  });
}
