import type { ID, ISODateTime } from './common'

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'skipped'

export type RunKind = 'ingestion' | 'pipeline' | 'transformation' | 'dbt_test' | 'schema_apply'

export type RunTrigger = 'manual' | 'schedule' | 'retry' | 'onboarding' | 'api'

/** Stages of the end-to-end flow: Source -> Ingestion -> Bronze -> dbt -> Silver/Gold -> Quality -> Metabase. */
export type StageKey =
  | 'source_connect'
  | 'ingestion'
  | 'bronze_load'
  | 'dbt_transform'
  | 'silver_gold_publish'
  | 'quality_checks'
  | 'metabase_refresh'

export interface RunError {
  stage: StageKey | null
  code: string
  message: string
  details: string | null
  retryable: boolean
}

export interface RunStage {
  key: StageKey
  name: string
  status: RunStatus
  started_at: ISODateTime | null
  finished_at: ISODateTime | null
  duration_seconds: number | null
  error: RunError | null
  /** Why a stage with status "skipped" did not execute; null otherwise. */
  skip_reason: string | null
  metrics: Record<string, number>
}

export interface TableSyncResult {
  table: string
  status: RunStatus
  mode: 'full' | 'incremental'
  records: number
  error: string | null
}

/**
 * Every long-running operation (sync, pipeline run, dbt run/test, schema apply)
 * is an asynchronous Run. Triggers respond with 202 and the initial Run; clients
 * poll GET /runs/{run_id} (and /logs) until `status` is terminal.
 */
export interface Run {
  id: ID
  workspace_id: ID
  kind: RunKind
  status: RunStatus
  trigger: RunTrigger
  triggered_by: { id: ID; name: string }
  target_name: string
  pipeline_id: ID | null
  source_id: ID | null
  transformation_id: ID | null
  schedule_id: ID | null
  schema_proposal_id: ID | null
  queued_at: ISODateTime
  started_at: ISODateTime | null
  finished_at: ISODateTime | null
  duration_seconds: number | null
  attempt: number
  retry_of: ID | null
  records_processed: number | null
  stages: RunStage[]
  tables: TableSyncResult[]
  error: RunError | null
}

export type RunSummary = Pick<
  Run,
  | 'id'
  | 'kind'
  | 'status'
  | 'trigger'
  | 'target_name'
  | 'pipeline_id'
  | 'source_id'
  | 'transformation_id'
  | 'queued_at'
  | 'started_at'
  | 'finished_at'
  | 'duration_seconds'
  | 'attempt'
> & {
  error_message: string | null
  /** Whether the failure can be retried as is (`error.retryable`); null when the run has no error. */
  retryable: boolean | null
}

export type LogLevel = 'debug' | 'info' | 'warning' | 'error'

export interface LogLine {
  seq: number
  ts: ISODateTime
  level: LogLevel
  stage: StageKey | null
  message: string
}

export interface RunLogsResponse {
  run_id: ID
  lines: LogLine[]
  /** Pass as `after` to fetch only newer lines. */
  next_cursor: number
  /** True once the run is terminal and no further lines will be appended. */
  complete: boolean
}

export interface RunListQuery {
  /** One kind, or several (sent as a comma-separated list, e.g. kind=transformation,dbt_test). */
  kind?: RunKind | RunKind[]
  status?: RunStatus
  page?: number
  page_size?: number
}

export const TERMINAL_RUN_STATUSES: RunStatus[] = ['succeeded', 'failed', 'cancelled', 'skipped']

export function isTerminal(status: RunStatus) {
  return TERMINAL_RUN_STATUSES.includes(status)
}
