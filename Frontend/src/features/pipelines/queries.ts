import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { hasActiveRuns, runKeys } from '@/components/runs/use-run'
import { pipelinesService } from '@/services/pipelines.service'
import { runsService } from '@/services/runs.service'
import { schedulesService } from '@/services/schedules.service'
import { sourcesService } from '@/services/sources.service'
import type {
  CreatePipelineRequest,
  Paginated,
  Pipeline,
  PipelineListQuery,
  Run,
  RunListQuery,
  TriggerPipelineRunRequest,
  UpdatePipelineRequest,
} from '@/types'
import { hasActiveRun } from './lib/pipeline-state'

/** Lists with in-flight runs refresh at this cadence (the run page itself polls every 2s). */
export const LIST_POLL_MS = 3000

export const pipelineKeys = {
  all: ['pipelines'] as const,
  list: (workspaceId: string, query: PipelineListQuery) => ['pipelines', workspaceId, 'list', query] as const,
  detail: (pipelineId: string) => ['pipelines', 'detail', pipelineId] as const,
  runs: (pipelineId: string, query: RunListQuery) => ['pipelines', 'detail', pipelineId, 'runs', query] as const,
}

const pipelineActive = (p: Pipeline | undefined) => Boolean(p && hasActiveRun(p))
const pageActive = (page: Paginated<Run> | undefined) => hasActiveRuns(page?.items)

/**
 * Keeps the previous page or filter result on screen while the next one loads, but
 * only for the same owner (workspace or pipeline) so another workspace's rows never flash.
 */
function keepWithinScope<T>(index: number, scope: string) {
  return (previous: T | undefined, previousQuery: { queryKey: QueryKey } | undefined) =>
    previousQuery?.queryKey[index] === scope ? previous : undefined
}

export function usePipelines(workspaceId: string, query: PipelineListQuery = {}) {
  return useQuery({
    queryKey: pipelineKeys.list(workspaceId, query),
    queryFn: () => pipelinesService.list(workspaceId, query),
    placeholderData: keepWithinScope<Pipeline[]>(1, workspaceId),
    refetchInterval: (q) => (q.state.data?.some(pipelineActive) ? LIST_POLL_MS : false),
  })
}

export function usePipeline(pipelineId: string | undefined) {
  return useQuery({
    queryKey: pipelineKeys.detail(pipelineId ?? ''),
    queryFn: () => pipelinesService.get(pipelineId!),
    enabled: Boolean(pipelineId),
    refetchInterval: (q) => (pipelineActive(q.state.data) ? LIST_POLL_MS : false),
  })
}

export function usePipelineRuns(pipelineId: string, query: RunListQuery) {
  return useQuery({
    queryKey: pipelineKeys.runs(pipelineId, query),
    queryFn: () => pipelinesService.runs(pipelineId, query),
    placeholderData: keepWithinScope<Paginated<Run>>(2, pipelineId),
    refetchInterval: (q) => (pageActive(q.state.data) ? LIST_POLL_MS : false),
  })
}

export function useWorkspaceRuns(workspaceId: string, query: RunListQuery) {
  return useQuery({
    queryKey: runKeys.workspace(workspaceId, query),
    queryFn: () => runsService.listForWorkspace(workspaceId, query),
    placeholderData: keepWithinScope<Paginated<Run>>(2, workspaceId),
    refetchInterval: (q) => (pageActive(q.state.data) ? LIST_POLL_MS : false),
  })
}

/** Sources of the workspace, for the source picker, filters and name lookups. */
export function useWorkspaceSources(workspaceId: string) {
  return useQuery({
    queryKey: ['sources', workspaceId, 'list', {}],
    queryFn: () => sourcesService.list(workspaceId),
  })
}

export function useSchedule(scheduleId: string | null | undefined) {
  return useQuery({
    queryKey: ['schedules', 'detail', scheduleId ?? ''],
    queryFn: () => schedulesService.get(scheduleId!),
    enabled: Boolean(scheduleId),
    retry: false,
  })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return (...prefixes: string[]) => Promise.all(prefixes.map((p) => queryClient.invalidateQueries({ queryKey: [p] })))
}

export function useCreatePipeline(workspaceId: string) {
  const invalidate = useInvalidate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreatePipelineRequest) => pipelinesService.create(workspaceId, payload),
    onSuccess: (pipeline) => {
      queryClient.setQueryData(pipelineKeys.detail(pipeline.id), pipeline)
      return invalidate('pipelines', 'overview', 'audit')
    },
  })
}

export function useUpdatePipeline() {
  const invalidate = useInvalidate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdatePipelineRequest }) => pipelinesService.update(id, payload),
    onSuccess: (pipeline) => {
      queryClient.setQueryData(pipelineKeys.detail(pipeline.id), pipeline)
      return invalidate('pipelines', 'schedules', 'overview', 'audit')
    },
  })
}

export function useDeletePipeline() {
  const invalidate = useInvalidate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => pipelinesService.remove(id),
    onSuccess: (_void, id) => {
      // Skip the deleted pipeline's own queries: refetching them would only return 404.
      const detail = pipelineKeys.detail(id)
      void queryClient.invalidateQueries({ queryKey: pipelineKeys.all, predicate: (q) => !(q.queryKey[1] === detail[1] && q.queryKey[2] === detail[2]) })
      return invalidate('overview', 'audit', 'schedules')
    },
  })
}

export function useTriggerPipeline() {
  const invalidate = useInvalidate()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: TriggerPipelineRunRequest }) => pipelinesService.trigger(id, payload),
    onSuccess: (run) => {
      queryClient.setQueryData(runKeys.detail(run.id), run)
      return invalidate('pipelines', 'runs', 'sources', 'overview', 'audit', 'notifications')
    },
  })
}
