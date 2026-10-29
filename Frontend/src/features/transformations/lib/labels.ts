import type { Materialization, RunKind, RunStatus, RunTrigger, TestResult, TransformationType } from '@/types'

export const TYPE_LABELS: Record<TransformationType, string> = {
  staging: 'Staging',
  intermediate: 'Intermediate',
  silver: 'Silver',
  gold: 'Gold',
}

export const TYPE_OPTIONS = (Object.keys(TYPE_LABELS) as TransformationType[]).map((value) => ({ value, label: TYPE_LABELS[value] }))

export const MATERIALIZATION_HELP: Record<Materialization, string> = {
  view: 'Rebuilt as a database view on every run; no data is stored.',
  table: 'Rebuilt as a full table on every run.',
  incremental: 'Only new or changed rows are processed on each run. A full refresh rebuilds the table from scratch.',
  ephemeral: 'Not built in the warehouse; inlined into downstream models as a common table expression.',
}

export const RUN_STATUS_OPTIONS: { value: RunStatus; label: string }[] = [
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'running', label: 'Running' },
  { value: 'queued', label: 'Queued' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'cancelled', label: 'Cancelled' },
]

export const DBT_RUN_KIND_LABELS: Partial<Record<RunKind, string>> = {
  transformation: 'dbt run',
  dbt_test: 'dbt test',
}

export const TRIGGER_LABELS: Record<RunTrigger, string> = {
  manual: 'Manual',
  schedule: 'Schedule',
  retry: 'Retry',
  onboarding: 'Onboarding',
  api: 'API',
}

export const TEST_STATUS: Record<TestResult['status'], { label: string; variant: 'success' | 'danger' | 'warning' | 'outline' }> = {
  passed: { label: 'Passed', variant: 'success' },
  failed: { label: 'Failed', variant: 'danger' },
  warning: { label: 'Warning', variant: 'warning' },
  not_run: { label: 'Not run', variant: 'outline' },
}

export const TEST_TYPE_LABELS: Record<string, string> = {
  not_null: 'Not null',
  unique: 'Unique',
  accepted_values: 'Accepted values',
  relationships: 'Relationships',
  freshness: 'Freshness',
  row_count: 'Row count',
  custom_sql: 'Custom SQL',
}
