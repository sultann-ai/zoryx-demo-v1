import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endBusinessDay, fetchCurrentBusinessDay, startBusinessDay } from "../api/businessDay";

export const businessDayQueryKey = ["business-day", "current"] as const;

export function useCurrentBusinessDay(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: businessDayQueryKey,
    queryFn: fetchCurrentBusinessDay,
    enabled: options?.enabled,
  });
}

export function useStartBusinessDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (label?: string) => startBusinessDay(label),
    onSuccess: (businessDay) => {
      queryClient.setQueryData(businessDayQueryKey, businessDay);
    },
  });
}

export function useEndBusinessDay() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (force?: boolean) => endBusinessDay(force),
    onSuccess: (businessDay) => {
      queryClient.setQueryData(businessDayQueryKey, businessDay);
    },
  });
}
