import { staffApi } from "../api/staff";
import { createCrudHooks } from "./createCrudHooks";

export const {
  useList: useStaffList,
  useCreate: useCreateStaff,
  useUpdate: useUpdateStaff,
  useRemove: useDeactivateStaff,
} = createCrudHooks(["staff"], staffApi);
