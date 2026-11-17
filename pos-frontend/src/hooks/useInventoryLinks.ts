import { inventoryLinksApi } from "../api/inventoryLinks";
import { createCrudHooks } from "./createCrudHooks";

export const {
  useList: useInventoryLinks,
  useCreate: useCreateInventoryLink,
  useUpdate: useUpdateInventoryLink,
  useRemove: useDeleteInventoryLink,
} = createCrudHooks(["inventory-links"], inventoryLinksApi);
