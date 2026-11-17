import { apiClient } from "./client";

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LEAVE" | "HALF_DAY";

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employee: { id: string; name: string };
  date: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  remarks: string | null;
}

export interface MarkAttendanceInput {
  employeeId: string;
  date: string;
  status: AttendanceStatus;
}

export const attendanceApi = {
  getRange: async (startDate: string, endDate: string): Promise<AttendanceRecord[]> => {
    const { data } = await apiClient.get<AttendanceRecord[]>("/api/pos/employees/attendance", {
      params: { startDate, endDate },
    });
    return data;
  },
  mark: async (input: MarkAttendanceInput): Promise<AttendanceRecord> => {
    const { data } = await apiClient.post<AttendanceRecord>("/api/pos/employees/attendance", input);
    return data;
  },
};
