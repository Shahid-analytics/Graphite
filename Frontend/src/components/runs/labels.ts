import { Database, Download, LayoutDashboard, Layers, Plug, ShieldCheck, Workflow, type LucideIcon } from 'lucide-react'
import type { Permission, Run, RunError, RunKind, RunTrigger, StageKey } from '@/types'

/** Canonical order of the end-to-end flow. */
export const STAGE_ORDER: StageKey[] = [
  'source_connect',
  'ingestion',
  'bronze_load',
  'dbt_transform',
  'silver_gold_publish',
  'quality_checks',
  'metabase_refresh',
]

export const STAGE_META: Record<StageKey, { short: string; name: string; icon: LucideIcon; description: string }> = {
  source_connect: { short: 'Source', name: 'Source connection', icon: Plug, description: 'Connects to Salesforce, PostgreSQL or another source and verifies credentials and permissions.' },
  ingestion: { short: 'Ingestion', name: 'Ingestion (dlt)', icon: Download, description: 'dlt extracts new and changed records since the last saved cursor, or every row on a full refresh.' },
  bronze_load: { short: 'Bronze', name: 'Bronze load', icon: Database, description: 'Raw records land unchanged in the PostgreSQL Bronze schema, one table per source object.' },
  dbt_transform: { short: 'dbt', name: 'dbt transformation', icon: Workflow, description: 'dbt builds the selected staging, intermediate and mart models in dependency order.' },
  silver_gold_publish: { short: 'Silver / Gold', name: 'Silver / Gold publish', icon: Layers, description: 'Cleaned Silver tables and business-ready Gold facts and dimensions are swapped into place.' },
  quality_checks: { short: 'Quality', name: 'Data quality checks', icon: ShieldCheck, description: 'dbt tests and freshness checks run; an error-severity failure stops the run before dashboards refresh.' },
  metabase_refresh: { short: 'Metabase', name: 'Metabase refresh', icon: LayoutDashboard, description: 'Metabase metadata is synced and dashboard caches are refreshed so reports show the new data.' },
}

export const RUN_KIND_LABELS: Record<RunKind, string> = {
  ingestion: 'Source sync',
  pipeline: 'Pipeline run',
  transformation: 'dbt run',
  dbt_test: 'dbt test',
  schema_apply: 'Schema apply',
}

export const RUN_TRIGGER_LABELS: Record<RunTrigger, string> = {
  manual: 'Manual',
  schedule: 'Schedule',
  retry: 'Retry',
  onboarding: 'Onboarding',
  api: 'API',
}

export const METRIC_LABELS: Record<string, string> = {
  rows_extracted: 'Rows extracted',
  rows_loaded: 'Rows loaded',
  models_built: 'Models built',
  tests_run: 'Tests run',
  tests_failed: 'Tests failed',
}

export function metricLabel(key: string) {
  return METRIC_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

/** Permission needed to retry or cancel a run; mirrors the backend rule. */
export function runPermissionFor(kind: RunKind): Permission {
  if (kind === 'ingestion') return 'sources:sync'
  if (kind === 'pipeline') return 'pipelines:run'
  return 'transformations:run'
}

/** Query key prefixes affected when a run of this kind changes state. */
export const DOMAINS_FOR_KIND: Record<RunKind, string[]> = {
  ingestion: ['sources'],
  pipeline: ['pipelines', 'sources'],
  transformation: ['transformations', 'models'],
  dbt_test: ['transformations', 'models'],
  schema_apply: ['proposals', 'models'],
}

export interface RunTargetLink {
  /** Section label and route of the resource collection. */
  section: { label: string; path: string }
  /** The specific resource the run belongs to, when known. */
  resource: { label: string; path: string; type: string } | null
}

/** Where a run's target lives in the app, used for breadcrumbs and links. */
export function runTarget(workspaceId: string, run: Pick<Run, 'kind' | 'target_name' | 'pipeline_id' | 'source_id' | 'transformation_id' | 'schema_proposal_id'>): RunTargetLink {
  const base = `/w/${workspaceId}`
  if (run.kind === 'pipeline' && run.pipeline_id) {
    return { section: { label: 'Pipelines & Sync Jobs', path: `${base}/pipelines` }, resource: { label: run.target_name, path: `${base}/pipelines/${run.pipeline_id}`, type: 'Pipeline' } }
  }
  if (run.kind === 'ingestion' && run.source_id) {
    return { section: { label: 'Data Sources', path: `${base}/sources` }, resource: { label: run.target_name, path: `${base}/sources/${run.source_id}`, type: 'Source' } }
  }
  if ((run.kind === 'transformation' || run.kind === 'dbt_test') && run.transformation_id) {
    return { section: { label: 'Transformations', path: `${base}/transformations` }, resource: { label: run.target_name, path: `${base}/transformations/${run.transformation_id}`, type: 'Transformation' } }
  }
  if (run.kind === 'schema_apply' && run.schema_proposal_id) {
    return { section: { label: 'Data Models', path: `${base}/models` }, resource: { label: run.target_name, path: `${base}/models/proposals/${run.schema_proposal_id}`, type: 'Schema proposal' } }
  }
  return { section: { label: 'Pipelines & Sync Jobs', path: `${base}/pipelines` }, resource: null }
}

export interface NextStep {
  text: string
  action?: { label: string; path: string }
}

/** Suggested remediation for a run error, by error code with a stage-based fallback. */
export function suggestedNextStep(workspaceId: string, run: Pick<Run, 'source_id' | 'transformation_id' | 'pipeline_id'>, error: RunError): NextStep {
  const base = `/w/${workspaceId}`
  const source = run.source_id ? { label: 'Open source settings', path: `${base}/sources/${run.source_id}` } : undefined
  switch (error.code) {
    case 'source_auth_failed':
      return { text: 'Update the credentials in the source connection settings, run a connection test, then retry this run.', action: source }
    case 'source_rate_limited':
      return { text: 'The source API quota is exhausted. Wait for the quota window to reset or lower the sync frequency; the next run resumes from the saved cursor.', action: source }
    case 'quality_checks_failed':
      return {
        text: 'Inspect the failing rows for the test in the model catalog, fix the upstream data or the model logic, then retry. Dashboards keep showing the last good data until the run passes.',
        action: { label: 'Open data models', path: `${base}/models` },
      }
    case 'dbt_model_error':
      return {
        text: 'Fix the model SQL (often a type change in the source) and trigger a new run. Retrying without a change will fail the same way.',
        action: run.transformation_id ? { label: 'Open transformation', path: `${base}/transformations/${run.transformation_id}` } : { label: 'Open transformations', path: `${base}/transformations` },
      }
  }
  switch (error.stage) {
    case 'source_connect':
    case 'ingestion':
    case 'bronze_load':
      return { text: 'Check the source connection and selected tables, then retry.', action: source }
    case 'dbt_transform':
    case 'silver_gold_publish':
      return { text: 'Review the dbt logs below for the failing model, fix it, then trigger a new run.', action: { label: 'Open transformations', path: `${base}/transformations` } }
    case 'quality_checks':
      return { text: 'Review the failing tests in the model catalog before retrying.', action: { label: 'Open data models', path: `${base}/models` } }
    case 'metabase_refresh':
      return { text: 'Verify the Metabase integration in Settings, then retry. The warehouse data is already up to date.', action: { label: 'Open Metabase settings', path: `${base}/settings/metabase` } }
    default:
      return { text: error.retryable ? 'Review the logs below, then retry the run.' : 'Review the logs below and fix the underlying issue before triggering a new run.' }
  }
}
