import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DealCreateInput, DealUpdateInput } from "../api/deals";
import { dealsApi } from "../api/deals";

const DEALS_KEY = "deals";

export function useDeals() {
  return useQuery({ queryKey: [DEALS_KEY], queryFn: dealsApi.list });
}

export function useCreateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DealCreateInput) => dealsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DEALS_KEY] }),
  });
}

export function useUpdateDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DealUpdateInput }) => dealsApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DEALS_KEY] }),
  });
}

export function useDeleteDeal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dealsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DEALS_KEY] }),
  });
}
