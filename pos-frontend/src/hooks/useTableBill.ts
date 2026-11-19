import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiErrorStatus } from "../api/errors";
import type { SplitInput, TableBill, TableSessionDetail } from "../api/tables";
import {
  fetchTableReceipt,
  printTableReceipt,
  markTableSharePaid,
  rejectTableShare,
  requestTableBill,
  setTableBillDiscount,
  setTableBillSplit,
  unlockTableBill,
  unmarkTableShare,
  verifyTableShare,
} from "../api/tables";
import { FLOOR_QUERY_KEY, TABLE_SESSION_QUERY_KEY } from "./useTables";

// The table bill's staff actions (docs/TABLE_QR_SPEC.md §4.2 phase 2). Not optimistic: every write is
// checked against the bill's version and may be refused (a guest re-split meanwhile, an order still at
// reception), and money shown as paid that then isn't would mislead whoever is at the table. The
// server's answer is the bill as it now stands, so it goes straight into the session's cache; the
// floor map (PAYING x/y) is refetched too. A refusal refetches as well — a 409 BILL_CHANGED means
// this screen was showing an old bill.

const receiptKey = (sessionId: string) => ["table-sessions", sessionId, "receipt"] as const;

function useBillMutation<TVariables>(sessionId: string, mutationFn: (variables: TVariables) => Promise<{ bill: TableBill }>) {
  const queryClient = useQueryClient();
  const sessionKey = [...TABLE_SESSION_QUERY_KEY, sessionId];
  return useMutation({
    mutationFn,
    onSuccess: ({ bill }) => {
      queryClient.setQueryData<TableSessionDetail>(sessionKey, (current) => (current ? { ...current, bill } : current));
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: sessionKey });
      queryClient.invalidateQueries({ queryKey: FLOOR_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: receiptKey(sessionId) });
    },
  });
}

export function useRequestTableBill(sessionId: string) {
  return useBillMutation(sessionId, () => requestTableBill(sessionId));
}

export function useUnlockTableBill(sessionId: string) {
  return useBillMutation(sessionId, (expectedVersion: number) => unlockTableBill(sessionId, expectedVersion));
}

export function useSetTableBillDiscount(sessionId: string) {
  return useBillMutation(sessionId, (input: { discount: string; discountReason?: string; expectedVersion: number }) =>
    setTableBillDiscount(sessionId, input),
  );
}

export function useSetTableBillSplit(sessionId: string) {
  return useBillMutation(sessionId, (input: SplitInput & { expectedVersion: number }) => setTableBillSplit(sessionId, input));
}

export function useMarkTableSharePaid(sessionId: string) {
  return useBillMutation(sessionId, ({ shareId, paidAmount }: { shareId: string; paidAmount: string | null }) =>
    markTableSharePaid(sessionId, shareId, paidAmount),
  );
}

export function useVerifyTableShare(sessionId: string) {
  return useBillMutation(sessionId, (shareId: string) => verifyTableShare(sessionId, shareId));
}

export function useRejectTableShare(sessionId: string) {
  return useBillMutation(sessionId, ({ shareId, reason }: { shareId: string; reason: string }) => rejectTableShare(sessionId, shareId, reason));
}

export function useUnmarkTableShare(sessionId: string) {
  return useBillMutation(sessionId, ({ shareId, reason }: { shareId: string; reason: string }) => unmarkTableShare(sessionId, shareId, reason));
}

// The table's receipt, once it exists (the bill was paid, or the table closed with something paid).
// A 404 just means "not yet" — no retries for it.
export function useTableReceipt(sessionId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: receiptKey(sessionId ?? ""),
    queryFn: () => fetchTableReceipt(sessionId as string),
    enabled: enabled && sessionId !== null,
    retry: (failureCount, error) => getApiErrorStatus(error) !== 404 && failureCount < 2,
    staleTime: Infinity,
  });
}

export function usePrintTableReceipt(sessionId: string) {
  return useMutation({
    mutationFn: (printerId?: string) => printTableReceipt(sessionId, printerId),
  });
}
