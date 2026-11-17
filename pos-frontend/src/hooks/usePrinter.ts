import { useMutation, useQuery } from "@tanstack/react-query";
import { printApi } from "../api/print";
import type { PrintDoc } from "../print/printProtocol";

export const DEFAULT_PRINTER_ID = (import.meta.env.VITE_PRINTER_ID as string | undefined) ?? "main";

export function usePrinterStatus(printerId: string = DEFAULT_PRINTER_ID) {
  return useQuery({
    queryKey: ["print-status", printerId],
    queryFn: () => printApi.getStatus(printerId),
    refetchInterval: 15000,
  });
}

export function usePrintDocs() {
  return useMutation({
    mutationFn: ({ printerId = DEFAULT_PRINTER_ID, docs }: { printerId?: string; docs: PrintDoc[] }) =>
      printApi.print(printerId, docs),
  });
}
