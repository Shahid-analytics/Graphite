import { api } from './api-client'

export const healthService = {
  health: () => api.get<{ status: string; version: string; time: string }>('/health'),
  ready: () => api.get<{ status: string; checks: Record<string, string> }>('/ready'),
}
