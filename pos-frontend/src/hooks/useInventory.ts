import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdjustStockInput, InventoryItemCreateInput, InventoryItemUpdateInput } from "../api/inventory";
import { inventoryApi } from "../api/inventory";

const INVENTORY_ITEMS_KEY = "inventory-items";

export function useInventoryItems(lowStockOnly: boolean) {
  return useQuery({
    queryKey: [INVENTORY_ITEMS_KEY, lowStockOnly],
    queryFn: () => inventoryApi.list(lowStockOnly),
  });
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: InventoryItemCreateInput) => inventoryApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INVENTORY_ITEMS_KEY] }),
  });
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: InventoryItemUpdateInput }) => inventoryApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INVENTORY_ITEMS_KEY] }),
  });
}

export function useAdjustStock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AdjustStockInput }) => inventoryApi.adjust(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INVENTORY_ITEMS_KEY] }),
  });
}

export function useDeleteInventoryItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => inventoryApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INVENTORY_ITEMS_KEY] }),
  });
}
