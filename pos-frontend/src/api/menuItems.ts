import { apiClient } from "./client";

// An add-on available at this variant's size (scoped to the item's category — see
// backend/prisma/schema.prisma's AddOn comment). Not every add-on applies to every size.
export interface AvailableAddOn {
  id: string;
  name: string;
  price: string;
}

export interface MenuItemVariant {
  id: string;
  menuItemId: string;
  label: string;
  // Null for a deal-only size (e.g. Nuggets "5 pc") — never orderable on its own.
  price: string | null;
  sortOrder: number;
  addOns: AvailableAddOn[];
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  // Null for a sized item (variants carry the real prices) or a deal-only item —
  // see backend/prisma/schema.prisma's MenuItem.price comment.
  price: string | null;
  // False for an item that only ever appears inside a deal, never sold on its own
  // (e.g. "Full Broast") — matches backend/prisma/schema.prisma's MenuItem.sellableAlone.
  sellableAlone: boolean;
  // True for an item with no menu-set price — the cashier types the price at order
  // time (e.g. a custom cake). Mutually exclusive with price and with having any size.
  isOpenPrice: boolean;
  // Optional guard rails on the price the cashier can type; both null means no limit.
  // Meaningless on a non-open-price item.
  minPrice: string | null;
  maxPrice: string | null;
  kitchenId: string;
  categoryId: string | null;
  imageUrl: string | null;
  // Customer-website fields (edited from Online store -> Menu photos and names).
  imageId: string | null;
  nameUr: string | null;
  descriptionUr: string | null;
  isFeatured: boolean;
  sortOrder: number;
  isAvailableInPOS: boolean;
  isAvailableOnline: boolean;
  createdAt: string;
  updatedAt: string;
  variants: MenuItemVariant[];
}

export interface MenuItemCreateInput {
  name: string;
  description?: string;
  // Omit (or pass null) for a sized item — add its sizes afterward via createVariant.
  price?: number | null;
  kitchenId: string;
  categoryId?: string;
  isAvailableInPOS?: boolean;
  isAvailableOnline?: boolean;
  isOpenPrice?: boolean;
  minPrice?: number | null;
  maxPrice?: number | null;
}

export interface MenuItemUpdateInput {
  name?: string;
  description?: string | null;
  // Explicit null converts this item to sized (clears its standalone price).
  price?: number | null;
  kitchenId?: string;
  categoryId?: string | null;
  isAvailableInPOS?: boolean;
  isAvailableOnline?: boolean;
  isOpenPrice?: boolean;
  minPrice?: number | null;
  maxPrice?: number | null;
}

export interface MenuItemVariantInput {
  label?: string;
  price?: number | null;
  sortOrder?: number;
}

// Not built on createCrudApi() — list here takes an optional kitchenId filter,
// and there's a fifth, role-scoped write endpoint (online-availability) besides
// the standard create/update/remove, plus the variant (size) sub-resource below.
export const menuItemsApi = {
  list: async (kitchenId?: string): Promise<MenuItem[]> => {
    const { data } = await apiClient.get<MenuItem[]>("/api/pos/menu", {
      params: kitchenId ? { kitchenId } : undefined,
    });
    return data;
  },
  create: async (input: MenuItemCreateInput): Promise<MenuItem> => {
    const { data } = await apiClient.post<MenuItem>("/api/pos/menu", input);
    return data;
  },
  update: async (id: string, input: MenuItemUpdateInput): Promise<MenuItem> => {
    const { data } = await apiClient.put<MenuItem>(`/api/pos/menu/${id}`, input);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/pos/menu/${id}`);
  },
  setOnlineAvailability: async (id: string, isAvailableOnline: boolean): Promise<MenuItem> => {
    const { data } = await apiClient.patch<MenuItem>(`/api/pos/menu/${id}/online-availability`, {
      isAvailableOnline,
    });
    return data;
  },
  createVariant: async (
    menuItemId: string,
    input: { label: string } & MenuItemVariantInput,
  ): Promise<MenuItemVariant> => {
    const { data } = await apiClient.post<MenuItemVariant>(`/api/pos/menu/${menuItemId}/variants`, input);
    return data;
  },
  updateVariant: async (
    menuItemId: string,
    variantId: string,
    input: MenuItemVariantInput,
  ): Promise<MenuItemVariant> => {
    const { data } = await apiClient.put<MenuItemVariant>(
      `/api/pos/menu/${menuItemId}/variants/${variantId}`,
      input,
    );
    return data;
  },
  removeVariant: async (menuItemId: string, variantId: string): Promise<void> => {
    await apiClient.delete(`/api/pos/menu/${menuItemId}/variants/${variantId}`);
  },
};
