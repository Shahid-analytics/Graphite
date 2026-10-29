import type { Overview } from '@/types'
import { api } from './api-client'

export const overviewService = {
  get: (workspaceId: string) => api.get<Overview>(`/workspaces/${workspaceId}/overview`),
}
