import { createCrudApi } from "./crud";

export interface Employee {
  id: string;
  name: string;
  phone: string | null;
  designation: string;
  baseSalary: string;
  joiningDate: string;
  isActive: boolean;
  createdAt: string;
}

export interface EmployeeCreateInput {
  name: string;
  designation: string;
  baseSalary: number;
  joiningDate: string;
  phone?: string;
}

export interface EmployeeUpdateInput {
  name?: string;
  designation?: string;
  baseSalary?: number;
  joiningDate?: string;
  phone?: string | null;
}

// Note: DELETE here is a real hard delete (unlike Staff's deactivate) — not
// exposed in the UI yet, this pass only needs list/create/update.
export const employeesApi = createCrudApi<Employee, EmployeeCreateInput, EmployeeUpdateInput>("/api/pos/employees");
