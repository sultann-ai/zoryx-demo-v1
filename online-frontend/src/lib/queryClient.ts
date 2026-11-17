import { QueryClient } from '@tanstack/react-query'

// Slow, expensive mobile data: cache for a minute, retry twice, never refetch just because the tab regained focus.
// (The order-status page opts back in per query.)
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})
