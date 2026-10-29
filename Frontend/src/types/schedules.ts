import type { ID, ISODateTime } from './common'
import type { RunSummary } from './runs'

export type ScheduleTargetType = 'pipeline' | 'source_sync' | 'transformation'

export type IntervalPreset =
  | 'every_15_minutes'
  | 'hourly'
  | 'every_6_hours'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom'

export type OverlapPolicy = 'skip' | 'queue' | 'cancel_running'

export interface RetryPolicy {
  max_attempts: number
  backoff_seconds: number
  backoff_strategy: 'fixed' | 'exponential'
}

export interface ConcurrencyPolicy {
  max_concurrent_runs: number
  overlap_policy: OverlapPolicy
}

export interface Schedule {
  id: ID
  workspace_id: ID
  name: string
  description: string
  target_type: ScheduleTargetType
  target_id: ID
  target_name: string
  preset: IntervalPreset
  cron: string
  timezone: string
  enabled: boolean
  retry: RetryPolicy
  concurrency: ConcurrencyPolicy
  next_run_at: ISODateTime | null
  last_run: RunSummary | null
  created_by: { id: ID; name: string }
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface ScheduleListQuery {
  q?: string
  enabled?: boolean
  target_type?: ScheduleTargetType
}

export interface UpsertScheduleRequest {
  name: string
  description?: string
  target_type: ScheduleTargetType
  target_id: ID
  preset: IntervalPreset
  cron: string
  timezone: string
  enabled: boolean
  retry: RetryPolicy
  concurrency: ConcurrencyPolicy
}

export type UpdateScheduleRequest = Partial<UpsertScheduleRequest>

export interface ScheduleConflict {
  schedule_id: ID
  schedule_name: string
  kind: 'same_target' | 'overlapping_window' | 'shared_source'
  message: string
}

export interface ValidateScheduleRequest {
  cron: string
  timezone: string
  target_type: ScheduleTargetType
  target_id: ID
  /** Exclude this schedule from conflict detection (when editing). */
  schedule_id?: ID
}

export interface ValidateScheduleResponse {
  valid: boolean
  description: string | null
  next_runs: ISODateTime[]
  conflicts: ScheduleConflict[]
  errors: string[]
}
