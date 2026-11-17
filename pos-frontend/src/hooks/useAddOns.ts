import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddOnCreateInput, AddOnUpdateInput } from "../api/addOns";
import { addOnsApi } from "../api/addOns";

const ADD_ONS_KEY = "add-ons";
// Add-on availability/pricing is embedded in every menu item response (per variant),
// so a write here must also invalidate that cache or the New Order screen and Menu
// tab would show stale add-on options until an unrelated refetch happened to occur.
const MENU_ITEMS_KEY = "menu-items";

export function useAddOns() {
  return useQuery({
    queryKey: [ADD_ONS_KEY],
    queryFn: () => addOnsApi.list(),
  });
}

function invalidateAddOns(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: [ADD_ONS_KEY] });
  queryClient.invalidateQueries({ queryKey: [MENU_ITEMS_KEY] });
}

export function useCreateAddOn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AddOnCreateInput) => addOnsApi.create(input),
    onSuccess: () => invalidateAddOns(queryClient),
  });
}

export function useUpdateAddOn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddOnUpdateInput }) => addOnsApi.update(id, input),
    onSuccess: () => invalidateAddOns(queryClient),
  });
}

export function useDeleteAddOn() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => addOnsApi.remove(id),
    onSuccess: () => invalidateAddOns(queryClient),
  });
}

export function useSetAddOnPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ addOnId, size, price }: { addOnId: string; size: string; price: number }) =>
      addOnsApi.setPrice(addOnId, size, price),
    onSuccess: () => invalidateAddOns(queryClient),
  });
}

export function useRemoveAddOnPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ addOnId, size }: { addOnId: string; size: string }) => addOnsApi.removePrice(addOnId, size),
    onSuccess: () => invalidateAddOns(queryClient),
  });
}
