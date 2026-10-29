import type { ID, ISODateTime } from './common'
import type { RunStatus, RunSummary, StageKey } from './runs'

export type PipelineStatus = 'active' | 'paused' | 'draft'

export interface Pipeline {
  id: ID
  workspace_id: ID
  name: string
  description: string
  status: PipelineStatus
  source_ids: ID[]
  /** dbt node selector, e.g. "tag:sales+". */
  dbt_selector: string
  stages: StageKey[]
  quality_checks_enabled: boolean
  metabase_refresh_enabled: boolean
  schedule_id: ID | null
  next_run_at: ISODateTime | null
  last_run: RunSummary | null
  success_rate_7d: number | null
  avg_duration_seconds: number | null
  owner: { id: ID; name: string }
  created_at: ISODateTime
  updated_at: ISODateTime
}

export interface PipelineListQuery {
  q?: string
  status?: PipelineStatus
  last_run_status?: RunStatus
  source_id?: ID
}

export interface CreatePipelineRequest {
  name: string
  description?: string
  source_ids: ID[]
  dbt_selector: string
  quality_checks_enabled: boolean
  metabase_refresh_enabled: boolean
}

export type UpdatePipelineRequest = Partial<CreatePipelineRequest> & { status?: PipelineStatus }

export interface TriggerPipelineRunRequest {
  full_refresh?: boolean
  /** Optional subset of stages to execute; others are reported as skipped. */
  stages?: StageKey[]
}
