import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { analyticsApi } from "../api/analytics";
import type { AnalyticsQuery } from "../api/analytics";

// Cached briefly so flipping between chips is instant. Today (the active business day) also
// re-polls so the numbers keep moving during service, on top of the refetch-on-focus every
// query here already has.
export function useAnalytics(query: AnalyticsQuery, enabled = true) {
  return useQuery({
    queryKey: ["analytics", query.period, query.from ?? null, query.to ?? null],
    queryFn: () => analyticsApi.get(query),
    enabled,
    staleTime: 30_000,
    refetchInterval: query.period === "today" ? 30_000 : false,
    placeholderData: keepPreviousData,
  });
}
