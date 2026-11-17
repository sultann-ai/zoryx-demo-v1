import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MarkAttendanceInput } from "../api/attendance";
import { attendanceApi } from "../api/attendance";

export function useAttendanceRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ["attendance", startDate, endDate],
    queryFn: () => attendanceApi.getRange(startDate, endDate),
    enabled: startDate !== "" && endDate !== "",
  });
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MarkAttendanceInput) => attendanceApi.mark(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["attendance"] }),
  });
}
