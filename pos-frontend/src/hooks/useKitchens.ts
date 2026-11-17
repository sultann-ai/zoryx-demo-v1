import { kitchensApi } from "../api/kitchens";
import { createCrudHooks } from "./createCrudHooks";

export const {
  useList: useKitchens,
  useCreate: useCreateKitchen,
  useUpdate: useUpdateKitchen,
  useRemove: useDeleteKitchen,
} = createCrudHooks(["kitchens"], kitchensApi);
