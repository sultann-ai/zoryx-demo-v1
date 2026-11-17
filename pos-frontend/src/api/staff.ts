import type { StaffRole } from "../auth/session";
import { createCrudApi } from "./crud";

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  role: StaffRole;
  kitchenId: string | null;
  employeeId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffCreateInput {
  name: string;
  username: string;
  password: string;
  role: StaffRole;
  kitchenId?: string;
  employeeId?: string;
}

// username can't be changed after creation — the backend's update endpoint has
// no field for it.
export interface StaffUpdateInput {
  name?: string;
  role?: StaffRole;
  kitchenId?: string | null;
  employeeId?: string | null;
  isActive?: boolean;
  password?: string;
}

// DELETE here deactivates server-side (isActive: false) rather than hard-deleting.
export const staffApi = createCrudApi<StaffUser, StaffCreateInput, StaffUpdateInput>("/api/pos/staff");
