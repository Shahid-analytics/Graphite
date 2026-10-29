import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hasActiveRuns, runKeys } from '@/components/runs/use-run'
import { LIVE_POLL_MS } from '@/lib/query-client'
import { runsService } from '@/services/runs.service'
import { sourcesService } from '@/services/sources.service'
import type {
  CreateSourceRequest,
  DiscoverRequest,
  Run,
  RunListQuery,
  SourceListQuery,
  TestNewConnectionRequest,
  TriggerSyncRequest,
  UpdateSourceRequest,
} from '@/types'

export const sourceKeys = {
  all: ['sources'] as const,
  connectors: ['sources', 'connectors'] as const,
  list: (workspaceId: string, query: SourceListQuery = {}) => ['sources', 'list', workspaceId, query] as const,
  detail: (sourceId: string) => ['sources', 'detail', sourceId] as const,
  runs: (sourceId: string, query: RunListQuery = {}) => ['sources', 'detail', sourceId, 'runs', query] as const,
  tables: (sourceId: string) => ['sources', 'detail', sourceId, 'tables'] as const,
  preview: (sourceId: string, table: string, page: number) => ['sources', 'detail', sourceId, 'preview', table, page] as const,
}

/** Refresh cadence for the sources list while a sync is in flight. */
const LIST_POLL_MS = 4000

export function useConnectors() {
  return useQuery({ queryKey: sourceKeys.connectors, queryFn: sourcesService.connectors, staleTime: 10 * 60_000 })
}

export function useSources(workspaceId: string, query: SourceListQuery = {}, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: sourceKeys.list(workspaceId, query),
    queryFn: () => sourcesService.list(workspaceId, query),
    placeholderData: keepPreviousData,
    refetchInterval: options.poll ? LIST_POLL_MS : false,
  })
}

export function useSource(sourceId: string, options: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: sourceKeys.detail(sourceId),
    queryFn: () => sourcesService.get(sourceId),
    refetchInterval: options.poll ? LIVE_POLL_MS : false,
  })
}

export function useSourceRuns(sourceId: string, query: RunListQuery = {}) {
  return useQuery({
    queryKey: sourceKeys.runs(sourceId, query),
    queryFn: () => sourcesService.runs(sourceId, query),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (hasActiveRuns(q.state.data?.items) ? LIVE_POLL_MS : false),
  })
}

export function useSourceTables(sourceId: string, enabled = true) {
  return useQuery({ queryKey: sourceKeys.tables(sourceId), queryFn: () => sourcesService.tables(sourceId), enabled })
}

export function useTablePreview(sourceId: string, table: string | null, page: number, pageSize: number) {
  return useQuery({
    queryKey: sourceKeys.preview(sourceId, table ?? '', page),
    queryFn: () => sourcesService.previewTable(sourceId, table!, { page, page_size: pageSize }),
    enabled: Boolean(table),
    placeholderData: keepPreviousData,
  })
}

/** Invalidates everything a source change can affect, optionally skipping one deleted source's queries. */
function useInvalidateSources() {
  const queryClient = useQueryClient()
  return (extra: string[][] = [], deletedSourceId?: string) =>
    Promise.all(
      [['sources'], ['overview'], ['schedules'], ['audit'], ...extra].map((queryKey) =>
        queryClient.invalidateQueries({
          queryKey,
          predicate: deletedSourceId ? (q) => !(q.queryKey[0] === 'sources' && q.queryKey[1] === 'detail' && q.queryKey[2] === deletedSourceId) : undefined,
        }),
      ),
    )
}

export function useCreateSource(workspaceId: string) {
  const invalidate = useInvalidateSources()
  return useMutation({
    mutationFn: (payload: CreateSourceRequest) => sourcesService.create(workspaceId, payload),
    onSuccess: () => invalidate([['workspaces'], ['runs']]),
  })
}

export function useUpdateSource() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateSources()
  return useMutation({
    mutationFn: ({ sourceId, payload }: { sourceId: string; payload: UpdateSourceRequest }) => sourcesService.update(sourceId, payload),
    onSuccess: (source) => {
      queryClient.setQueryData(sourceKeys.detail(source.id), source)
      return invalidate()
    },
  })
}

export function useDeleteSource() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateSources()
  return useMutation({
    mutationFn: (sourceId: string) => sourcesService.remove(sourceId),
    onSuccess: (_data, sourceId) => {
      // Mark the deleted source's queries stale without refetching them while its page is
      // still mounted (that would flash a 404 before the caller navigates away).
      void queryClient.invalidateQueries({ queryKey: sourceKeys.detail(sourceId), refetchType: 'none' })
      return invalidate([['pipelines']], sourceId)
    },
  })
}

export function useSyncSource() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateSources()
  return useMutation({
    mutationFn: ({ sourceId, payload }: { sourceId: string; payload?: TriggerSyncRequest }) => sourcesService.sync(sourceId, payload),
    onSuccess: (run) => {
      queryClient.setQueryData(runKeys.detail(run.id), run)
      return invalidate([['runs'], ['notifications']])
    },
  })
}

export function useTestSourceConnection() {
  return useMutation({
    mutationFn: ({ sourceId, config }: { sourceId: string; config?: TestNewConnectionRequest['config'] }) =>
      sourcesService.testConnection(sourceId, config),
  })
}

export function useTestNewConnection(workspaceId: string) {
  return useMutation({ mutationFn: (payload: TestNewConnectionRequest) => sourcesService.testNewConnection(workspaceId, payload) })
}

export function useDiscover(workspaceId: string) {
  return useMutation({ mutationFn: (payload: DiscoverRequest) => sourcesService.discover(workspaceId, payload) })
}

export function useRetrySourceRun() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateSources()
  return useMutation({
    mutationFn: (run: Pick<Run, 'id'>) => runsService.retry(run.id),
    onSuccess: (run) => {
      queryClient.setQueryData(runKeys.detail(run.id), run)
      return invalidate([['runs'], ['pipelines'], ['notifications']])
    },
  })
}

export function useCancelSourceRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (run: Pick<Run, 'id'>) => runsService.cancel(run.id),
    onSuccess: (run) => {
      queryClient.setQueryData(runKeys.detail(run.id), run)
      return Promise.all([['sources'], ['runs'], ['overview']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
  })
}
