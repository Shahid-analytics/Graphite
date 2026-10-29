import { QueryClient } from '@tanstack/react-query'
import { isApiError } from '@/services/api-error'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry client errors; retry transient failures once.
        if (isApiError(error) && error.status >= 400 && error.status < 500) return false
        return failureCount < 1
      },
    },
    mutations: { retry: false },
  },
})

/** Poll interval for resources with in-flight runs. */
export const LIVE_POLL_MS = 2000
