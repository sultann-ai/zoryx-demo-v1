import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MenuItemCreateInput, MenuItemUpdateInput, MenuItemVariantInput } from "../api/menuItems";
import { menuItemsApi } from "../api/menuItems";

const MENU_ITEMS_KEY = "menu-items";

function menuItemsQueryKey(kitchenId?: string) {
  return [MENU_ITEMS_KEY, kitchenId ?? "all"] as const;
}

export function useMenuItems(kitchenId?: string) {
  return useQuery({
    queryKey: menuItemsQueryKey(kitchenId),
    queryFn: () => menuItemsApi.list(kitchenId),
  });
}

export function useCreateMenuItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: MenuItemCreateInput) => menuItemsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MENU_ITEMS_KEY] }),
  });
}

export function useUpdateMenuItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MenuItemUpdateInput }) => menuItemsApi.update(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MENU_ITEMS_KEY] }),
  });
}

export function useDeleteMenuItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => menuItemsApi.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MENU_ITEMS_KEY] }),
  });
}

export function useSetMenuItemOnlineAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isAvailableOnline }: { id: string; isAvailableOnline: boolean }) =>
      menuItemsApi.setOnlineAvailability(id, isAvailableOnline),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MENU_ITEMS_KEY] }),
  });
}

export function useCreateMenuItemVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, input }: { menuItemId: string; input: { label: string } & MenuItemVariantInput }) =>
      menuItemsApi.createVariant(menuItemId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MENU_ITEMS_KEY] }),
  });
}

export function useUpdateMenuItemVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      menuItemId,
      variantId,
      input,
    }: {
      menuItemId: string;
      variantId: string;
      input: MenuItemVariantInput;
    }) => menuItemsApi.updateVariant(menuItemId, variantId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MENU_ITEMS_KEY] }),
  });
}

export function useRemoveMenuItemVariant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ menuItemId, variantId }: { menuItemId: string; variantId: string }) =>
      menuItemsApi.removeVariant(menuItemId, variantId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [MENU_ITEMS_KEY] }),
  });
}
