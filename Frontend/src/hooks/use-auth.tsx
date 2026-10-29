import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { onUnauthorized, setAccessToken } from '@/services/api-client'
import { isApiError } from '@/services/api-error'
import { authService } from '@/services/auth.service'
import type { LoginRequest, Session } from '@/types'

interface AuthContextValue {
  session: Session | null
  isLoading: boolean
  error: unknown
  login: (payload: LoginRequest) => Promise<Session>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const SESSION_QUERY_KEY = ['auth', 'me'] as const

/**
 * Drops every cached query except the session. queryClient.clear() would also
 * remove the session query that AuthProvider observes, leaving it reading stale data.
 */
function clearUserData(queryClient: QueryClient) {
  queryClient.cancelQueries({ predicate: (q) => q.queryKey[0] !== SESSION_QUERY_KEY[0] })
  queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_QUERY_KEY[0] })
  queryClient.getMutationCache().clear()
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const sessionQuery = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      try {
        return await authService.me()
      } catch (error) {
        if (isApiError(error) && error.status === 401) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  })

  useEffect(() => {
    onUnauthorized(() => {
      setAccessToken(null)
      queryClient.setQueryData(SESSION_QUERY_KEY, null)
    })
    return () => onUnauthorized(null)
  }, [queryClient])

  const login = useCallback(
    async (payload: LoginRequest) => {
      const response = await authService.login(payload)
      setAccessToken(response.access_token ?? null)
      clearUserData(queryClient)
      queryClient.setQueryData(SESSION_QUERY_KEY, response.session)
      return response.session
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } finally {
      setAccessToken(null)
      clearUserData(queryClient)
      queryClient.setQueryData(SESSION_QUERY_KEY, null)
    }
  }, [queryClient])

  const value = useMemo<AuthContextValue>(
    () => ({ session: sessionQuery.data ?? null, isLoading: sessionQuery.isLoading, error: sessionQuery.error, login, logout }),
    [sessionQuery.data, sessionQuery.isLoading, sessionQuery.error, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
