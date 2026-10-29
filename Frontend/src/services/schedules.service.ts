import type {
  Paginated,
  Run,
  RunListQuery,
  Schedule,
  ScheduleListQuery,
  UpdateScheduleRequest,
  UpsertScheduleRequest,
  ValidateScheduleRequest,
  ValidateScheduleResponse,
} from '@/types'
import { api } from './api-client'

export const schedulesService = {
  list: (workspaceId: string, query: ScheduleListQuery = {}) => api.get<Schedule[]>(`/workspaces/${workspaceId}/schedules`, { query }),
  get: (scheduleId: string) => api.get<Schedule>(`/schedules/${scheduleId}`),
  create: (workspaceId: string, payload: UpsertScheduleRequest) => api.post<Schedule>(`/workspaces/${workspaceId}/schedules`, payload),
  update: (scheduleId: string, payload: UpdateScheduleRequest) => api.patch<Schedule>(`/schedules/${scheduleId}`, payload),
  remove: (scheduleId: string) => api.delete<void>(`/schedules/${scheduleId}`),
  runs: (scheduleId: string, query: RunListQuery = {}) => api.get<Paginated<Run>>(`/schedules/${scheduleId}/runs`, { query }),
  /** Triggers the schedule's target immediately (202). */
  runNow: (scheduleId: string) => api.post<Run>(`/schedules/${scheduleId}/run`),
  /** Server-side cron validation, next run times and conflict detection. */
  validate: (workspaceId: string, payload: ValidateScheduleRequest) =>
    api.post<ValidateScheduleResponse>(`/workspaces/${workspaceId}/schedules/validate`, payload),
}
