import { useQuery } from '@tanstack/react-query'
import { LIVE_POLL_MS } from '@/lib/query-client'
import { runsService } from '@/services/runs.service'
import { isTerminal, type Run } from '@/types'

export const runKeys = {
  all: ['runs'] as const,
  detail: (runId: string) => ['runs', runId] as const,
  logs: (runId: string) => ['runs', runId, 'logs'] as const,
  workspace: (workspaceId: string, query: object) => ['runs', 'workspace', workspaceId, query] as const,
}

/**
 * Fetches a run and polls every 2 seconds until it reaches a terminal state.
 * Polling is the documented live-update mechanism; see docs/backend-api-contract.md.
 */
export function useRun(runId: string | null | undefined) {
  return useQuery({
    queryKey: runKeys.detail(runId ?? ''),
    queryFn: () => runsService.get(runId!),
    enabled: Boolean(runId),
    refetchInterval: (query) => {
      const run = query.state.data as Run | undefined
      return run && isTerminal(run.status) ? false : LIVE_POLL_MS
    },
  })
}

/** True when any run in the list is still queued or running (use to enable list polling). */
export function hasActiveRuns(runs: { status: Run['status'] }[] | undefined) {
  return Boolean(runs?.some((r) => !isTerminal(r.status)))
}
