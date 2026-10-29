import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hasActiveRuns } from '@/components/runs/use-run'
import { LIVE_POLL_MS } from '@/lib/query-client'
import { pipelinesService } from '@/services/pipelines.service'
import { schedulesService } from '@/services/schedules.service'
import { sourcesService } from '@/services/sources.service'
import { transformationsService } from '@/services/transformations.service'
import type {
  Run,
  RunListQuery,
  Schedule,
  ScheduleListQuery,
  ScheduleTargetType,
  UpdateScheduleRequest,
  UpsertScheduleRequest,
  ValidateScheduleRequest,
} from '@/types'

export const scheduleKeys = {
  all: ['schedules'] as const,
  lists: (workspaceId: string) => ['schedules', workspaceId, 'list'] as const,
  list: (workspaceId: string, query: ScheduleListQuery) => ['schedules', workspaceId, 'list', query] as const,
  detail: (scheduleId: string) => ['schedules', 'detail', scheduleId] as const,
  runs: (scheduleId: string, query: RunListQuery) => ['schedules', 'detail', scheduleId, 'runs', query] as const,
  validate: (workspaceId: string, payload: ValidateScheduleRequest) => ['schedules', workspaceId, 'validate', payload] as const,
}

/** Keeps "next run" times current even when nothing is running. */
const IDLE_REFRESH_MS = 60_000

function scheduleListHasActiveRuns(schedules: Schedule[] | undefined) {
  return hasActiveRuns(schedules?.map((s) => s.last_run).filter((r) => r !== null))
}

export function useSchedules(workspaceId: string, query: ScheduleListQuery = {}) {
  return useQuery({
    queryKey: scheduleKeys.list(workspaceId, query),
    queryFn: () => schedulesService.list(workspaceId, query),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (scheduleListHasActiveRuns(q.state.data) ? LIVE_POLL_MS * 2 : IDLE_REFRESH_MS),
  })
}

export function useSchedule(scheduleId: string | undefined) {
  return useQuery({
    queryKey: scheduleKeys.detail(scheduleId ?? ''),
    queryFn: () => schedulesService.get(scheduleId!),
    enabled: Boolean(scheduleId),
    refetchInterval: (q) => {
      const last = q.state.data?.last_run
      return last && hasActiveRuns([last]) ? LIVE_POLL_MS : IDLE_REFRESH_MS
    },
  })
}

export function useScheduleRuns(scheduleId: string, query: RunListQuery) {
  return useQuery({
    queryKey: scheduleKeys.runs(scheduleId, query),
    queryFn: () => schedulesService.runs(scheduleId, query),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (hasActiveRuns(q.state.data?.items) ? LIVE_POLL_MS : false),
  })
}

/** Server-side validation and conflict detection. Pass null to skip (e.g. while the cron is invalid). */
export function useValidateSchedule(workspaceId: string, payload: ValidateScheduleRequest | null) {
  return useQuery({
    queryKey: scheduleKeys.validate(workspaceId, payload ?? { cron: '', timezone: '', target_type: 'pipeline', target_id: '' }),
    queryFn: () => schedulesService.validate(workspaceId, payload!),
    enabled: Boolean(payload),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

// ---------------------------------------------------------------------------
// Target pickers
// ---------------------------------------------------------------------------

export function useScheduleTargets(workspaceId: string, type: ScheduleTargetType) {
  const pipelines = useQuery({
    queryKey: ['pipelines', workspaceId, 'schedule-targets'],
    queryFn: () => pipelinesService.list(workspaceId),
    enabled: type === 'pipeline',
  })
  const sources = useQuery({
    queryKey: ['sources', workspaceId, 'schedule-targets'],
    queryFn: () => sourcesService.list(workspaceId),
    enabled: type === 'source_sync',
  })
  const transformations = useQuery({
    queryKey: ['transformations', workspaceId, 'schedule-targets'],
    queryFn: () => transformationsService.list(workspaceId),
    enabled: type === 'transformation',
  })
  return { pipelines, sources, transformations }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Domains whose views embed schedule information (next run, sync frequency). */
const AFFECTED_PREFIXES = [['schedules'], ['pipelines'], ['sources'], ['overview'], ['audit']]

function useInvalidateAffected() {
  const queryClient = useQueryClient()
  return () => Promise.all(AFFECTED_PREFIXES.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

export function useCreateSchedule(workspaceId: string) {
  const invalidate = useInvalidateAffected()
  return useMutation({
    mutationFn: (payload: UpsertScheduleRequest) => schedulesService.create(workspaceId, payload),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateSchedule(scheduleId: string) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAffected()
  return useMutation({
    mutationFn: (payload: UpdateScheduleRequest) => schedulesService.update(scheduleId, payload),
    onSuccess: (schedule) => {
      queryClient.setQueryData(scheduleKeys.detail(schedule.id), schedule)
      return invalidate()
    },
  })
}

/** Optimistic enable/disable toggle across every cached list and the detail entry. */
export function useToggleSchedule(workspaceId: string) {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAffected()
  return useMutation({
    mutationFn: ({ schedule, enabled }: { schedule: Schedule; enabled: boolean }) => schedulesService.update(schedule.id, { enabled }),
    onMutate: async ({ schedule, enabled }) => {
      await queryClient.cancelQueries({ queryKey: scheduleKeys.lists(workspaceId) })
      await queryClient.cancelQueries({ queryKey: scheduleKeys.detail(schedule.id) })
      const lists = queryClient.getQueriesData<Schedule[]>({ queryKey: scheduleKeys.lists(workspaceId) })
      const detail = queryClient.getQueryData<Schedule>(scheduleKeys.detail(schedule.id))
      const patch = (s: Schedule) => (s.id === schedule.id ? { ...s, enabled, next_run_at: enabled ? s.next_run_at : null } : s)
      queryClient.setQueriesData<Schedule[]>({ queryKey: scheduleKeys.lists(workspaceId) }, (old) => old?.map(patch))
      if (detail) queryClient.setQueryData(scheduleKeys.detail(schedule.id), patch(detail))
      return { lists, detail }
    },
    onError: (_error, { schedule }, context) => {
      context?.lists.forEach(([key, data]) => queryClient.setQueryData(key, data))
      if (context?.detail) queryClient.setQueryData(scheduleKeys.detail(schedule.id), context.detail)
    },
    onSettled: () => invalidate(),
  })
}

export function useDeleteSchedule() {
  const queryClient = useQueryClient()
  const invalidate = useInvalidateAffected()
  return useMutation({
    mutationFn: (schedule: Schedule) => schedulesService.remove(schedule.id),
    onSuccess: (_data, schedule) => {
      queryClient.removeQueries({ queryKey: scheduleKeys.detail(schedule.id) })
      return invalidate()
    },
  })
}

const RUN_DOMAINS: Record<ScheduleTargetType, string[]> = {
  pipeline: ['pipelines', 'sources'],
  source_sync: ['sources'],
  transformation: ['transformations', 'models'],
}

export function useRunScheduleNow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (schedule: Schedule): Promise<Run> => schedulesService.runNow(schedule.id),
    onSuccess: (run, schedule) => {
      queryClient.setQueryData(['runs', run.id], run)
      const prefixes = [['schedules'], ['runs'], ['overview'], ['audit'], ...RUN_DOMAINS[schedule.target_type].map((d) => [d])]
      return Promise.all(prefixes.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
  })
}
