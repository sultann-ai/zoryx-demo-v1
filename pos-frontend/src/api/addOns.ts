import { apiClient } from "./client";

export interface AddOnPrice {
  id: string;
  addOnId: string;
  size: string;
  price: string;
}

export interface AddOnCategory {
  id: string;
  name: string;
}

export interface AddOn {
  id: string;
  name: string;
  categoryId: string | null;
  category: AddOnCategory | null;
  prices: AddOnPrice[];
}

export interface AddOnCreateInput {
  name: string;
  categoryId: string;
}

export interface AddOnUpdateInput {
  name?: string;
  categoryId?: string;
}

// Not built on createCrudApi() — prices are a per-size sub-resource (set/remove),
// not part of the plain update call, mirroring menuItems.ts's variant endpoints.
export const addOnsApi = {
  list: async (): Promise<AddOn[]> => {
    const { data } = await apiClient.get<AddOn[]>("/api/pos/addons");
    return data;
  },
  create: async (input: AddOnCreateInput): Promise<AddOn> => {
    const { data } = await apiClient.post<AddOn>("/api/pos/addons", input);
    return data;
  },
  update: async (id: string, input: AddOnUpdateInput): Promise<AddOn> => {
    const { data } = await apiClient.put<AddOn>(`/api/pos/addons/${id}`, input);
    return data;
  },
  remove: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/pos/addons/${id}`);
  },
  setPrice: async (addOnId: string, size: string, price: number): Promise<AddOnPrice> => {
    const { data } = await apiClient.put<AddOnPrice>(`/api/pos/addons/${addOnId}/prices/${encodeURIComponent(size)}`, {
      price,
    });
    return data;
  },
  removePrice: async (addOnId: string, size: string): Promise<void> => {
    await apiClient.delete(`/api/pos/addons/${addOnId}/prices/${encodeURIComponent(size)}`);
  },
};
