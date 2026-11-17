import { apiClient } from "./client";

export interface DealItem {
  id: string;
  dealId: string;
  menuItemId: string;
  quantity: number;
  menuItem: { id: string; name: string; price: string };
}

export interface Deal {
  id: string;
  name: string;
  description: string | null;
  price: string;
  // Customer-website fields (edited from Online store -> Menu photos and names).
  imageId: string | null;
  nameUr: string | null;
  descriptionUr: string | null;
  // The "Popular" star on the website.
  isFeatured: boolean;
  isActive: boolean;
  isAvailableInPOS: boolean;
  isAvailableOnline: boolean;
  createdAt: string;
  updatedAt: string;
  items: DealItem[];
}

export interface DealItemInput {
  menuItemId: string;
  quantity: number;
}

export interface DealCreateInput {
  name: string;
  description?: string;
  price: number;
  isActive?: boolean;
  isAvailableInPOS?: boolean;
  isAvailableOnline?: boolean;
  items: DealItemInput[];
}

export interface DealUpdateInput {
  name?: string;
  description?: string | null;
  price?: number;
  isActive?: boolean;
  isAvailableInPOS?: boolean;
  isAvailableOnline?: boolean;
  items?: DealItemInput[];
}

// Not built on createCrudApi() — matches menuItems.ts's hand-rolled style, since
// composition (items) is set in the same request rather than via a sub-resource.
export const dealsApi = {
  list: async (): Promise<Deal[]> => {
    const { data } = await apiClient.get<Deal[]>("/api/pos/deals");
    return data;
  },
  create: async (input: DealCreateInput): Promise<Deal> => {
    const { data } = await apiClient.post<Deal>("/api/pos/deals", input);
    return data;
  },
  update: async (id: string, input: DealUpdateInput): Promise<Deal> => {
    const { data } = await apiClient.put<Deal>(`/api/pos/deals/${id}`, input);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/pos/deals/${id}`);
  },
};
