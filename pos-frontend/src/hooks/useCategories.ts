import { categoriesApi } from "../api/categories";
import { createCrudHooks } from "./createCrudHooks";

export const {
  useList: useCategories,
  useCreate: useCreateCategory,
  useUpdate: useUpdateCategory,
  useRemove: useDeleteCategory,
} = createCrudHooks(["categories"], categoriesApi);
