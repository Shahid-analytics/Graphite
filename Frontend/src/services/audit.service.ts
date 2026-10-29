import type { AuditEvent, AuditExportFormat, AuditFacets, AuditQuery, Paginated } from '@/types'
import { api } from './api-client'

export const auditService = {
  list: (workspaceId: string, query: AuditQuery = {}) =>
    api.get<Paginated<AuditEvent>>(`/workspaces/${workspaceId}/audit-events`, { query }),
  facets: (workspaceId: string) => api.get<AuditFacets>(`/workspaces/${workspaceId}/audit-events/facets`),
  /** Streams an export file for the current filters (application/x-ndjson or text/plain). */
  export: (workspaceId: string, format: AuditExportFormat, query: Omit<AuditQuery, 'page' | 'page_size'> = {}) =>
    api.get<Blob>(`/workspaces/${workspaceId}/audit-events/export`, { query: { ...query, format }, responseType: 'blob', timeoutMs: 120_000 }),
}
