import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";

interface CrudApi<T, CreateInput, UpdateInput> {
  list: () => Promise<T[]>;
  create: (input: CreateInput) => Promise<T>;
  update: (id: string, input: UpdateInput) => Promise<T>;
  remove: (id: string) => Promise<void>;
}

// Wraps a createCrudApi() instance in the matching useQuery/useMutation hooks,
// all keyed off the same queryKey and invalidating the list on every write.
export function createCrudHooks<T, CreateInput, UpdateInput>(
  queryKey: QueryKey,
  api: CrudApi<T, CreateInput, UpdateInput>,
) {
  function useList() {
    return useQuery({ queryKey, queryFn: api.list });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: api.create,
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, input }: { id: string; input: UpdateInput }) => api.update(id, input),
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });
  }

  function useRemove() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.remove(id),
      onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    });
  }

  return { useList, useCreate, useUpdate, useRemove };
}
