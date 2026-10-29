import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { hasActiveRuns, runKeys } from '@/components/runs/use-run'
import { LIVE_POLL_MS } from '@/lib/query-client'
import { modelsService } from '@/services/models.service'
import { runsService } from '@/services/runs.service'
import { transformationsService } from '@/services/transformations.service'
import type {
  LineageGraph,
  ModelPreviewQuery,
  Paginated,
  Run,
  RunListQuery,
  RunStatus,
  RunTransformationRequest,
  TablePreview,
  TransformationListQuery,
  TransformationSummary,
  UpdateTransformationRequest,
} from '@/types'

/** List refresh cadence while any listed model has a queued or running dbt run. */
const LIST_LIVE_POLL_MS = 3000

export const transformationKeys = {
  all: ['transformations'] as const,
  project: (workspaceId: string) => ['transformations', workspaceId, 'project'] as const,
  list: (workspaceId: string, query: TransformationListQuery = {}) => ['transformations', workspaceId, 'list', query] as const,
  detail: (transformationId: string) => ['transformations', 'detail', transformationId] as const,
  runs: (transformationId: string, query: RunListQuery) => ['transformations', 'detail', transformationId, 'runs', query] as const,
  tests: (transformationId: string) => ['transformations', 'detail', transformationId, 'tests'] as const,
}

/** Keys owned by the models domain; shapes mirror features/data-models so caches are shared. */
export const linkedModelKeys = {
  list: (workspaceId: string) => ['models', workspaceId, 'list', {}] as const,
  workspaceLineage: (workspaceId: string) => ['models', workspaceId, 'lineage'] as const,
  lineage: (modelId: string, depth: number) => ['models', 'detail', modelId, 'lineage', depth] as const,
  preview: (modelId: string, query: ModelPreviewQuery) => ['models', 'detail', modelId, 'preview', query] as const,
}

const ACTIVE: RunStatus[] = ['queued', 'running']

function isActive(status: RunStatus | null | undefined) {
  return Boolean(status && ACTIVE.includes(status))
}

/**
 * Keeps the previous result on screen while a filter, page or depth changes, but only
 * when it belongs to the same workspace, model or run scope (key position `scopeIndex`),
 * so moving to another workspace or model never shows the old data.
 */
function keepWithinScope<T>(scope: string, scopeIndex: number) {
  return (previous: T | undefined, previousQuery?: { queryKey: QueryKey }) =>
    previousQuery?.queryKey[scopeIndex] === scope ? previous : undefined
}

/** Drops empty filters so the unfiltered list shares one cache entry. */
function cleanQuery(query: TransformationListQuery): TransformationListQuery {
  return Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')) as TransformationListQuery
}

export function useDbtProject(workspaceId: string) {
  return useQuery({ queryKey: transformationKeys.project(workspaceId), queryFn: () => transformationsService.project(workspaceId) })
}

export function useTransformations(workspaceId: string, query: TransformationListQuery = {}, enabled = true) {
  const clean = cleanQuery(query)
  return useQuery({
    queryKey: transformationKeys.list(workspaceId, clean),
    queryFn: () => transformationsService.list(workspaceId, clean),
    placeholderData: keepWithinScope<TransformationSummary[]>(workspaceId, 1),
    enabled,
    refetchInterval: (q) => (q.state.data?.some((t) => isActive(t.last_run_status)) ? LIST_LIVE_POLL_MS : false),
  })
}

export function useTransformation(transformationId: string) {
  return useQuery({
    queryKey: transformationKeys.detail(transformationId),
    queryFn: () => transformationsService.get(transformationId),
    refetchInterval: (q) => (isActive(q.state.data?.last_run_status) ? LIVE_POLL_MS : false),
  })
}

export function useTransformationRuns(transformationId: string, query: RunListQuery) {
  return useQuery({
    queryKey: transformationKeys.runs(transformationId, query),
    queryFn: () => transformationsService.runs(transformationId, query),
    placeholderData: keepWithinScope<Paginated<Run>>(transformationId, 2),
    refetchInterval: (q) => (hasActiveRuns(q.state.data?.items) ? LIVE_POLL_MS : false),
  })
}

export function useTransformationTests(transformationId: string) {
  return useQuery({ queryKey: transformationKeys.tests(transformationId), queryFn: () => transformationsService.tests(transformationId) })
}

export function useWorkspaceDbtRuns(workspaceId: string, query: RunListQuery) {
  return useQuery({
    queryKey: runKeys.workspace(workspaceId, query),
    queryFn: () => runsService.listForWorkspace(workspaceId, query),
    placeholderData: keepWithinScope<Paginated<Run>>(workspaceId, 2),
    refetchInterval: (q) => (hasActiveRuns(q.state.data?.items) ? LIVE_POLL_MS : false),
  })
}

export function useWorkspaceLineage(workspaceId: string, enabled = true) {
  return useQuery({
    queryKey: linkedModelKeys.workspaceLineage(workspaceId),
    queryFn: () => modelsService.workspaceLineage(workspaceId),
    enabled,
  })
}

export function useModelLineage(modelId: string | null, depth: number) {
  return useQuery({
    queryKey: linkedModelKeys.lineage(modelId ?? '', depth),
    queryFn: () => modelsService.lineage(modelId!, depth),
    enabled: Boolean(modelId),
    placeholderData: keepWithinScope<LineageGraph>(modelId ?? '', 2),
  })
}

export function useModelPreview(modelId: string | null, query: ModelPreviewQuery) {
  return useQuery({
    queryKey: linkedModelKeys.preview(modelId ?? '', query),
    queryFn: () => modelsService.preview(modelId!, query),
    enabled: Boolean(modelId),
    placeholderData: keepWithinScope<TablePreview>(modelId ?? '', 2),
  })
}

/** Workspace models, used only to show readable names for depends_on links. */
export function useWorkspaceModels(workspaceId: string) {
  return useQuery({ queryKey: linkedModelKeys.list(workspaceId), queryFn: () => modelsService.list(workspaceId) })
}

/** Refreshes everything a dbt run or test can change once it has been queued or has finished. */
export function invalidateAfterRun(queryClient: QueryClient) {
  return Promise.all(
    [['transformations'], ['runs'], ['models'], ['overview'], ['audit'], ['notifications']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  )
}

export function useUpdateTransformation(transformationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateTransformationRequest) => transformationsService.update(transformationId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(transformationKeys.detail(transformationId), updated)
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: transformationKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['audit'] }),
      ])
    },
  })
}

export function useRunTransformation(transformationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: RunTransformationRequest) => transformationsService.run(transformationId, payload),
    onSuccess: (run) => {
      queryClient.setQueryData(runKeys.detail(run.id), run)
      return invalidateAfterRun(queryClient)
    },
  })
}

export function useTestTransformation(transformationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => transformationsService.test(transformationId),
    onSuccess: (run) => {
      queryClient.setQueryData(runKeys.detail(run.id), run)
      return invalidateAfterRun(queryClient)
    },
  })
}
