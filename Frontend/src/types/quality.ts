import type { ID, ISODateTime } from './common'
import type { DataLayer } from './models'

export type QualityStatus = 'passed' | 'failed' | 'warning' | 'not_run'

export interface QualityCheck {
  id: ID
  model_id: ID
  model_name: string
  layer: DataLayer
  name: string
  column: string | null
  check_type: 'not_null' | 'unique' | 'accepted_values' | 'relationships' | 'freshness' | 'row_count' | 'custom_sql'
  severity: 'error' | 'warn'
  status: QualityStatus
  failing_rows: number
  message: string | null
  last_run_at: ISODateTime | null
  run_id: ID | null
}

export interface QualitySummary {
  generated_at: ISODateTime
  total: number
  passed: number
  failed: number
  warning: number
  not_run: number
  pass_rate: number
  by_layer: Record<DataLayer, { passed: number; failed: number; warning: number }>
  stale_models: number
  failing_checks: QualityCheck[]
}
