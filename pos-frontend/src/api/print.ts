import { apiClient } from "./client";
import type { PrintDoc } from "../print/printProtocol";

export interface PrintStatus {
  online: boolean;
}

export const printApi = {
  getStatus: async (printerId: string): Promise<PrintStatus> => {
    const { data } = await apiClient.get<PrintStatus>("/api/pos/print/status", { params: { printerId } });
    return data;
  },
  print: async (printerId: string, docs: PrintDoc[]): Promise<{ printed: number }> => {
    const { data } = await apiClient.post<{ printed: number }>("/api/pos/print", { printerId, docs });
    return data;
  },
};
