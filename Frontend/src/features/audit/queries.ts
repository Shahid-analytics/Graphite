import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { auditService } from '@/services/audit.service'
import type { AuditExportFormat } from '@/types'
import { toAuditQuery, type AuditFilters } from './lib/filters'

export const AUDIT_PAGE_SIZE = 25

export const auditKeys = {
  all: ['audit'] as const,
  workspace: (workspaceId: string) => ['audit', workspaceId] as const,
  events: (workspaceId: string, filters: AuditFilters, page: number) => ['audit', workspaceId, 'events', filters, page] as const,
  facets: (workspaceId: string) => ['audit', workspaceId, 'facets'] as const,
}

export function useAuditEvents(workspaceId: string, filters: AuditFilters, page: number, enabled = true) {
  return useQuery({
    queryKey: auditKeys.events(workspaceId, filters, page),
    enabled,
    // Quick ranges ("last 24h") are resolved when the request is made, not when the key is built.
    queryFn: () => auditService.list(workspaceId, { ...toAuditQuery(filters), page, page_size: AUDIT_PAGE_SIZE }),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  })
}

export function useAuditFacets(workspaceId: string) {
  return useQuery({
    queryKey: auditKeys.facets(workspaceId),
    queryFn: () => auditService.facets(workspaceId),
    staleTime: 60_000,
  })
}

export function useAuditExport(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ format, filters }: { format: AuditExportFormat; filters: AuditFilters }) =>
      auditService.export(workspaceId, format, toAuditQuery(filters)),
    // The export itself is recorded as an "audit.exported" event.
    onSettled: () => queryClient.invalidateQueries({ queryKey: auditKeys.workspace(workspaceId) }),
  })
}
