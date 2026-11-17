import { createCrudApi } from "./crud";

export interface Category {
  id: string;
  name: string;
  // Urdu name and display order on the customer website.
  nameUr: string | null;
  sortOrder: number;
  // Optional photo on the website's category section; without one the website uses the first item's photo.
  imageId: string | null;
}

export interface CategoryInput {
  name: string;
}

export const categoriesApi = createCrudApi<Category, CategoryInput, CategoryInput>("/api/pos/categories");
