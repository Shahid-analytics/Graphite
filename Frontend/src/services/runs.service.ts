import type { Paginated, Run, RunListQuery, RunLogsResponse } from '@/types'
import { api } from './api-client'

/** Sends a kind list as one comma-separated value (kind=transformation,dbt_test). */
function serialiseRunQuery({ kind, ...rest }: RunListQuery) {
  return { ...rest, kind: Array.isArray(kind) ? kind.join(',') || undefined : kind }
}

/** Generic execution endpoints shared by syncs, pipeline runs and dbt runs. */
export const runsService = {
  listForWorkspace: (workspaceId: string, query: RunListQuery = {}) =>
    api.get<Paginated<Run>>(`/workspaces/${workspaceId}/runs`, { query: serialiseRunQuery(query) }),
  get: (runId: string) => api.get<Run>(`/runs/${runId}`),
  logs: (runId: string, after = 0, level?: string) =>
    api.get<RunLogsResponse>(`/runs/${runId}/logs`, { query: { after, level } }),
  retry: (runId: string) => api.post<Run>(`/runs/${runId}/retry`),
  cancel: (runId: string) => api.post<Run>(`/runs/${runId}/cancel`),
}
