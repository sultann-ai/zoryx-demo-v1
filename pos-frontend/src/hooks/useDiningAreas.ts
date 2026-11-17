import { diningAreasApi } from "../api/diningAreas";
import { createCrudHooks } from "./createCrudHooks";

export const {
  useList: useDiningAreas,
  useCreate: useCreateDiningArea,
  useUpdate: useUpdateDiningArea,
  useRemove: useDeleteDiningArea,
} = createCrudHooks(["dining-areas"], diningAreasApi);
