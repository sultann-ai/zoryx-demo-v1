import { createCrudApi } from "./crud";

export interface Kitchen {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface KitchenInput {
  name: string;
  isActive?: boolean;
}

export const kitchensApi = createCrudApi<Kitchen, KitchenInput, KitchenInput>("/api/pos/kitchens");
