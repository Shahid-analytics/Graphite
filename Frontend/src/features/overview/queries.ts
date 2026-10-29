import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hasActiveRuns } from '@/components/runs/use-run'
import { workspaceKeys } from '@/hooks/use-workspace'
import { overviewService } from '@/services/overview.service'
import { runsService } from '@/services/runs.service'
import { workspaceService } from '@/services/workspace.service'
import type { Overview, Permission, RunKind, RunSummary, Workspace } from '@/types'

export const overviewKeys = {
  all: ['overview'] as const,
  detail: (workspaceId: string) => ['overview', workspaceId] as const,
}

/** Overview refresh cadence while any listed run is queued or running. */
export const OVERVIEW_LIVE_POLL_MS = 3000

export function overviewHasActiveRuns(data: Overview | undefined) {
  return hasActiveRuns(data?.recent_runs) || hasActiveRuns(data?.recent_transformation_runs) || (data?.runs_24h.running ?? 0) > 0
}

export function useOverview(workspaceId: string) {
  return useQuery({
    queryKey: overviewKeys.detail(workspaceId),
    queryFn: () => overviewService.get(workspaceId),
    refetchInterval: (query) => (overviewHasActiveRuns(query.state.data) ? OVERVIEW_LIVE_POLL_MS : false),
  })
}

export type RetryPermission = Extract<Permission, 'sources:sync' | 'pipelines:run' | 'transformations:run'>

/** Permission required to retry a run, mirroring the backend rule. */
export function retryPermissionFor(kind: RunKind): RetryPermission {
  if (kind === 'ingestion') return 'sources:sync'
  if (kind === 'pipeline') return 'pipelines:run'
  return 'transformations:run'
}

const DOMAIN_FOR_KIND: Record<RunKind, string[]> = {
  ingestion: ['sources'],
  pipeline: ['pipelines', 'sources'],
  transformation: ['transformations', 'models'],
  dbt_test: ['transformations', 'models'],
  schema_apply: ['proposals', 'models'],
}

export function useRetryRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (run: RunSummary) => runsService.retry(run.id),
    onSuccess: (_created, run) => {
      const prefixes = [['overview'], ['runs'], ['notifications'], ['audit'], ...DOMAIN_FOR_KIND[run.kind].map((d) => [d])]
      return Promise.all(prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
  })
}

export function useDismissOnboarding(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => workspaceService.updateOnboarding(workspaceId, { dismissed: true }),
    onSuccess: (onboarding) => {
      // Hide the checklist immediately; the refetch below confirms the server state.
      queryClient.setQueryData<Workspace>(workspaceKeys.detail(workspaceId), (ws) => (ws ? { ...ws, onboarding } : ws))
      return queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
    },
  })
}
