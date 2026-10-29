import type { LoginRequest, LoginResponse, Session } from '@/types'
import { api } from './api-client'

export const authService = {
  login: (payload: LoginRequest) => api.post<LoginResponse>('/auth/login', payload),
  logout: () => api.post<{ ok: boolean }>('/auth/logout'),
  me: () => api.get<Session>('/auth/me'),
}
