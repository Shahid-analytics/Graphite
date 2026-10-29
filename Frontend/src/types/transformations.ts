import type { ID, ISODateTime } from './common'
import type { RunStatus } from './runs'

export type TransformationType = 'staging' | 'intermediate' | 'silver' | 'gold'
export type Materialization = 'view' | 'table' | 'incremental' | 'ephemeral'

export interface DbtProject {
  id: ID
  workspace_id: ID
  name: string
  repository_url: string
  branch: string
  dbt_version: string
  target: string
  threads: number
  last_compiled_at: ISODateTime | null
  models_count: number
  tests_count: number
}

export interface TestSummary {
  total: number
  passed: number
  failed: number
  warned: number
}

export interface TransformationColumn {
  name: string
  data_type: string
  description: string
  tests: string[]
}

export interface Transformation {
  id: ID
  project_id: ID
  name: string
  /** dbt unique_id, e.g. "model.graphite.fct_invoices". */
  unique_id: string
  type: TransformationType
  materialization: Materialization
  schema: string
  description: string
  sql: string
  tags: string[]
  /** Upstream transformation ids or source model ids. */
  depends_on: ID[]
  /** Warehouse relation produced by this model (DataModel id). */
  output_model_id: ID | null
  columns: TransformationColumn[]
  last_run_status: RunStatus | null
  last_run_at: ISODateTime | null
  last_run_duration_seconds: number | null
  tests: TestSummary
  owner: string
  updated_at: ISODateTime
}

export type TransformationSummary = Omit<Transformation, 'sql' | 'columns'>

export interface TransformationListQuery {
  q?: string
  type?: TransformationType
  status?: RunStatus
  tag?: string
}

export interface UpdateTransformationRequest {
  sql?: string
  description?: string
  /** Commit message recorded by the backend when it writes to the dbt repository. */
  commit_message?: string
}

export interface RunTransformationRequest {
  include_upstream?: boolean
  include_downstream?: boolean
  full_refresh?: boolean
}

export interface TestResult {
  id: ID
  name: string
  column: string | null
  test_type: string
  status: 'passed' | 'failed' | 'warning' | 'not_run'
  failing_rows: number
  message: string | null
  last_run_at: ISODateTime | null
}
