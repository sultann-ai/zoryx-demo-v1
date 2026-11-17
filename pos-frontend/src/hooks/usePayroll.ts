import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpsertPayrollInput } from "../api/payroll";
import { payrollApi } from "../api/payroll";

export function useCurrentMonthPayroll() {
  return useQuery({ queryKey: ["payroll", "current-month"], queryFn: payrollApi.getCurrentMonth });
}

export function useUpsertPayroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPayrollInput) => payrollApi.upsert(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["payroll"] }),
  });
}
