import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AddLedgerEntryInput, VendorCreateInput, VendorUpdateInput } from "../api/vendors";
import { vendorsApi } from "../api/vendors";

export function useVendors() {
  return useQuery({ queryKey: ["vendors", "list"], queryFn: vendorsApi.list });
}

export function useVendor(id: string) {
  return useQuery({
    queryKey: ["vendors", "detail", id],
    queryFn: () => vendorsApi.get(id),
    enabled: id !== "",
  });
}

export function useCreateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorCreateInput) => vendorsApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vendors", "list"] }),
  });
}

export function useUpdateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VendorUpdateInput }) => vendorsApi.update(id, input),
    onSuccess: (vendor) => {
      queryClient.invalidateQueries({ queryKey: ["vendors", "list"] });
      queryClient.setQueryData(["vendors", "detail", vendor.id], vendor);
    },
  });
}

export function useVendorLedger(id: string) {
  return useQuery({
    queryKey: ["vendors", "ledger", id],
    queryFn: () => vendorsApi.getLedger(id),
    enabled: id !== "",
  });
}

export function useAddLedgerEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorId, input }: { vendorId: string; input: AddLedgerEntryInput }) =>
      vendorsApi.addLedgerEntry(vendorId, input),
    onSuccess: (_entry, { vendorId }) => {
      // The ledger's own balance and the list screen's per-row balance both
      // shift with every new entry, so both need to be refetched.
      queryClient.invalidateQueries({ queryKey: ["vendors", "ledger", vendorId] });
      queryClient.invalidateQueries({ queryKey: ["vendors", "list"] });
    },
  });
}
