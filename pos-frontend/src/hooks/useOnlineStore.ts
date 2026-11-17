import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import type {
  CategoryOnlineContentInput,
  DealOnlineContentInput,
  MenuItemOnlineContentInput,
  SiteSettingsInput,
} from "../api/onlineStore";
import {
  deliveryAreasApi,
  fetchOnlineStoreState,
  galleryApi,
  onlineContentApi,
  paymentAccountsApi,
  siteSettingsApi,
  testimonialsApi,
} from "../api/onlineStore";
import type { OrderUpdate } from "../lib/reorder";
import { createCrudHooks } from "./createCrudHooks";

const SETTINGS_KEY = ["online-store", "settings"] as const;
const STATE_KEY = ["online-store", "state"] as const;

// ---------- Store settings ----------

export function useSiteSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: siteSettingsApi.get });
}

export function useUpdateSiteSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteSettingsInput) => siteSettingsApi.update(input),
    onSuccess: (settings) => {
      queryClient.setQueryData(SETTINGS_KEY, settings);
      // The "Customers can order now" line depends on the switch that may just have changed.
      queryClient.invalidateQueries({ queryKey: STATE_KEY });
    },
  });
}

// What the website itself would say about ordering right now. Re-asked every 15 s so the line
// follows a business day starting or ending elsewhere.
export function useOnlineStoreState() {
  return useQuery({ queryKey: STATE_KEY, queryFn: fetchOnlineStoreState, refetchInterval: 15_000 });
}

// ---------- Lists ----------

export const {
  useList: useDeliveryAreas,
  useCreate: useCreateDeliveryArea,
  useUpdate: useUpdateDeliveryArea,
  useRemove: useDeleteDeliveryArea,
} = createCrudHooks(["online-store", "delivery-areas"], deliveryAreasApi);

export const {
  useList: usePaymentAccounts,
  useCreate: useCreatePaymentAccount,
  useUpdate: useUpdatePaymentAccount,
  useRemove: useDeletePaymentAccount,
} = createCrudHooks(["online-store", "payment-accounts"], paymentAccountsApi);

export const {
  useList: useGalleryImages,
  useCreate: useCreateGalleryImage,
  useUpdate: useUpdateGalleryImage,
  useRemove: useDeleteGalleryImage,
} = createCrudHooks(["online-store", "gallery"], galleryApi);

export const {
  useList: useTestimonials,
  useCreate: useCreateTestimonial,
  useUpdate: useUpdateTestimonial,
  useRemove: useDeleteTestimonial,
} = createCrudHooks(["online-store", "testimonials"], testimonialsApi);

// Applies the renumbering from lib/reorder.ts: one PUT per row whose position changed, then a single refresh.
export function useReorderRows(queryKey: QueryKey, api: { update: (id: string, input: { sortOrder: number }) => Promise<unknown> }) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: OrderUpdate[]) =>
      Promise.all(updates.map((update) => api.update(update.id, { sortOrder: update.sortOrder }))),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

export const useReorderDeliveryAreas = () => useReorderRows(["online-store", "delivery-areas"], deliveryAreasApi);
export const useReorderPaymentAccounts = () => useReorderRows(["online-store", "payment-accounts"], paymentAccountsApi);
export const useReorderGalleryImages = () => useReorderRows(["online-store", "gallery"], galleryApi);
export const useReorderTestimonials = () => useReorderRows(["online-store", "testimonials"], testimonialsApi);

// ---------- Website fields on menu items, deals, categories ----------

export function useUpdateMenuItemOnlineContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: MenuItemOnlineContentInput }) => onlineContentApi.menuItem(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["menu-items"] }),
  });
}

export function useUpdateDealOnlineContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: DealOnlineContentInput }) => onlineContentApi.deal(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["deals"] }),
  });
}

export function useUpdateCategoryOnlineContent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryOnlineContentInput }) => onlineContentApi.category(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
  });
}
