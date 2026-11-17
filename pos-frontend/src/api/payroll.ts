import { apiClient } from "./client";

export interface PayrollRow {
  id: string | null;
  employeeId: string;
  employeeName: string;
  month: number;
  year: number;
  baseSalary: string;
  allowance: string;
  deduction: string;
  advanceTaken: string;
  paidAmount: string;
  remainingAmount: string;
  paidAt: string | null;
  note: string | null;
  // true when this employee has no PayrollEntry yet for the current month —
  // the backend fills in a zeroed placeholder so every active employee has a row.
  isProjected: boolean;
}

export interface UpsertPayrollInput {
  employeeId: string;
  month: number;
  year: number;
  allowance?: number;
  deduction?: number;
  advanceTaken?: number;
  paidAmount?: number;
}

export const payrollApi = {
  getCurrentMonth: async (): Promise<PayrollRow[]> => {
    const { data } = await apiClient.get<PayrollRow[]>("/api/pos/employees/payroll/current-month");
    return data;
  },
  upsert: async (input: UpsertPayrollInput): Promise<PayrollRow> => {
    const { data } = await apiClient.post<PayrollRow>("/api/pos/employees/payroll", input);
    return data;
  },
};
