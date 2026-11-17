import { apiClient } from "./client";

// Generic REST CRUD calls for the simple admin resources (Kitchens, Categories,
// Dining Areas, ...) that all follow the same GET/POST/PUT/DELETE shape.
export function createCrudApi<T, CreateInput, UpdateInput>(basePath: string) {
  return {
    list: async (): Promise<T[]> => {
      const { data } = await apiClient.get<T[]>(basePath);
      return data;
    },
    create: async (input: CreateInput): Promise<T> => {
      const { data } = await apiClient.post<T>(basePath, input);
      return data;
    },
    update: async (id: string, input: UpdateInput): Promise<T> => {
      const { data } = await apiClient.put<T>(`${basePath}/${id}`, input);
      return data;
    },
    remove: async (id: string): Promise<void> => {
      await apiClient.delete(`${basePath}/${id}`);
    },
  };
}
