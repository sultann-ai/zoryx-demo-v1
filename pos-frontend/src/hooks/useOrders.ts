import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcceptOrderInput,
  AddOrderItemsInput,
  AssignOrderInput,
  CreateOrderInput,
  ListOrdersFilter,
  RejectOrderInput,
  SubmitOrderInput,
  UpdateScheduledItemsInput,
  UpdateSubmissionInput,
  CreateOrderChangeInput,
  ReviewedOrderChange,
} from "../api/orders";
import type { OrderDetail } from "../api/orders";
import { ordersApi } from "../api/orders";

export function useOrdersList(filter: ListOrdersFilter) {
  return useQuery({
    queryKey: ["orders", "list", filter],
    queryFn: () => ordersApi.list(filter),
  });
}

export function useOrder(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["orders", "detail", id],
    queryFn: () => ordersApi.get(id),
    enabled: id !== "" && options?.enabled !== false,
  });
}

// Keyed on the order's updatedAt, so every change to the order (which all go through its
// detail cache) refetches the history without each mutation having to invalidate it.
export function useOrderEvents(id: string, orderUpdatedAt: string | undefined) {
  return useQuery({
    queryKey: ["orders", "events", id, orderUpdatedAt],
    queryFn: () => ordersApi.listEvents(id),
    enabled: id !== "" && orderUpdatedAt !== undefined,
    placeholderData: (previous) => previous,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => ordersApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders", "list"] }),
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cancelledReason }: { id: string; cancelledReason: string }) =>
      ordersApi.cancel(id, cancelledReason),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
  });
}

export function useAssignOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignOrderInput }) => ordersApi.assign(id, input),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
  });
}

export function useUpdateOrderPaymentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      paymentStatus,
      discount,
      discountReason,
      paidAmount,
    }: {
      id: string;
      paymentStatus: "PENDING" | "VERIFIED";
      discount?: number;
      discountReason?: string;
      paidAmount?: number;
    }) => ordersApi.updatePaymentStatus(id, paymentStatus, {
        ...(discount !== undefined ? { discount } : {}),
        ...(discountReason !== undefined ? { discountReason } : {}),
        ...(paidAmount !== undefined ? { paidAmount } : {}),
      }),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
  });
}

export function useAddOrderItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AddOrderItemsInput }) => ordersApi.addItems(id, input),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
  });
}

export function useRemoveOrderItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId }: { id: string; itemId: string }) => ordersApi.removeItem(id, itemId),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
  });
}

export function useUpdateOrderItemNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, itemId, notes }: { id: string; itemId: string; notes: string | null }) =>
      ordersApi.updateItemNote(id, itemId, notes),
    onSuccess: (order) => {
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
  });
}

export function useUpdateOrderDealLineNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dealLineId, notes }: { id: string; dealLineId: string; notes: string | null }) =>
      ordersApi.updateDealLineNote(id, dealLineId, notes),
    onSuccess: (order) => {
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
  });
}

// Polled by IncomingOrdersContext (the one source of truth for the sidebar badge, the
// toasts, and the page itself) — not meant to be called a second time elsewhere.
export function useIncomingOrders() {
  return useQuery({
    queryKey: ["orders", "incoming"],
    queryFn: () => ordersApi.getIncoming(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

// One guest order, found by the code the customer reads out over the phone. Shares the ["orders",
// "incoming"] prefix, so accepting or rejecting it (which invalidates that prefix) refreshes this too.
export function useIncomingOrdersByCode(code: string | null) {
  return useQuery({
    queryKey: ["orders", "incoming", "code", code],
    queryFn: () => ordersApi.getIncoming(code ?? undefined),
    enabled: code !== null,
  });
}

function invalidateIncomingAndList(queryClient: ReturnType<typeof useQueryClient>, order: { id: string }) {
  queryClient.invalidateQueries({ queryKey: ["orders", "incoming"] });
  queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
  queryClient.setQueryData(["orders", "detail", order.id], order);
}

export function useAcceptOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AcceptOrderInput }) => ordersApi.accept(id, input),
    onSuccess: (order) => invalidateIncomingAndList(queryClient, order),
  });
}

export function useRejectOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RejectOrderInput }) => ordersApi.reject(id, input),
    onSuccess: (order) => invalidateIncomingAndList(queryClient, order),
  });
}

export function useMarkOrderDelivered() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ordersApi.markDelivered(id),
    onSuccess: (order) => invalidateIncomingAndList(queryClient, order),
  });
}

export function useMarkOrderNotCollected() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ordersApi.markNotCollected(id),
    onSuccess: (order) => invalidateIncomingAndList(queryClient, order),
  });
}

export function useUpdateSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSubmissionInput }) => ordersApi.updateSubmission(id, input),
    onSuccess: (order) => invalidateIncomingAndList(queryClient, order),
  });
}

// An ORDER_TAKER's own submit — reception's inbox is someone else's screen, so this
// only needs to invalidate this taker's own order list, not the incoming-orders query.
export function useSubmitOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitOrderInput) => ordersApi.submit(input),
    onSuccess: (order) => {
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
  });
}

export function useOrderChanges(id: string, enabled = true) {
  return useQuery({
    queryKey: ["orders", "changes", id],
    queryFn: () => ordersApi.listChanges(id),
    enabled: id !== "" && enabled,
  });
}

export function useCreateOrderChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: CreateOrderChangeInput }) => ordersApi.createChange(id, input),
    onSuccess: (_change, variables) => queryClient.invalidateQueries({ queryKey: ["orders", "changes", variables.id] }),
  });
}

// Order-taker change requests are reception's; pass enabled=false for a role that can't read them.
export function useIncomingOrderChanges(enabled = true) {
  return useQuery({
    queryKey: ["orders", "changes", "incoming"],
    queryFn: () => ordersApi.getIncomingChanges(),
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useReviewOrderChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ changeId, approved, rejectionReason }: { changeId: string; approved: boolean; rejectionReason?: string }): Promise<ReviewedOrderChange> =>
      ordersApi.reviewChange(changeId, approved, rejectionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["orders", "changes"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "incoming"] });
    },
  });
}

// ================= Scheduled orders =================

export const scheduledOrdersQueryKey = ["orders", "scheduled"] as const;

// Polled so a release by the server's job (every 30s) drops the order off this list without
// a reload; IncomingOrdersContext also invalidates it on every order:submitted.
export function useScheduledOrders() {
  return useQuery({
    queryKey: scheduledOrdersQueryKey,
    queryFn: ordersApi.listScheduled,
    refetchInterval: 15_000,
  });
}

function useScheduledOrderMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<OrderDetail>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (order) => {
      queryClient.setQueryData(["orders", "detail", order.id], order);
    },
    // Also on error: a 409 means someone (or the job) changed it first — refresh to show that.
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: scheduledOrdersQueryKey });
      queryClient.invalidateQueries({ queryKey: ["orders", "list"] });
      queryClient.invalidateQueries({ queryKey: ["orders", "incoming"] });
    },
  });
}

export function useReleaseScheduledOrder() {
  return useScheduledOrderMutation((id: string) => ordersApi.releaseScheduled(id));
}

export function useRescheduleOrder() {
  return useScheduledOrderMutation(({ id, scheduledFor }: { id: string; scheduledFor: string }) =>
    ordersApi.reschedule(id, scheduledFor),
  );
}

export function useUpdateScheduledItems() {
  return useScheduledOrderMutation(({ id, input }: { id: string; input: UpdateScheduledItemsInput }) =>
    ordersApi.updateScheduledItems(id, input),
  );
}

export function useCancelScheduledOrder() {
  return useScheduledOrderMutation(({ id, reason }: { id: string; reason?: string }) => ordersApi.cancelScheduled(id, reason));
}
