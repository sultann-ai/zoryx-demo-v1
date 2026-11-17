import { employeesApi } from "../api/employees";
import { createCrudHooks } from "./createCrudHooks";

export const {
  useList: useEmployees,
  useCreate: useCreateEmployee,
  useUpdate: useUpdateEmployee,
} = createCrudHooks(["employees"], employeesApi);
