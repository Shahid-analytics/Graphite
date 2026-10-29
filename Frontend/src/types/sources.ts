import type { HealthStatus, ID, ISODateTime, SecretState } from './common'
import type { RunStatus } from './runs'

export type ConnectorType =
  | 'salesforce'
  | 'postgres'
  | 'mysql'
  | 'hubspot'
  | 'zoho_crm'
  | 'google_sheets'
  | 'shopify'
  | 'tally'
  | 'razorpay'
  | 'csv_upload'

export type ConnectorCategory = 'crm' | 'database' | 'spreadsheet' | 'ecommerce' | 'finance' | 'file'

export interface ConnectorField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'select' | 'boolean' | 'textarea' | 'url'
  required: boolean
  /** Secret fields are write-only: never echoed back by the API. */
  secret: boolean
  placeholder?: string
  help?: string
  options?: { value: string; label: string }[]
  default?: string | number | boolean
}

export interface ConnectorDefinition {
  type: ConnectorType
  name: string
  category: ConnectorCategory
  description: string
  status: 'available' | 'coming_soon'
  /** Ingestion engine used by the backend, e.g. "dlt". */
  engine: string
  supports_incremental: boolean
  config_fields: ConnectorField[]
  docs_url: string | null
}

export type IngestionMode = 'full' | 'incremental'

export interface SelectedTable {
  schema: string
  name: string
  ingestion_mode: IngestionMode
  cursor_field: string | null
  primary_key: string[]
}

export type SyncFrequency = 'manual' | 'hourly' | 'every_6_hours' | 'daily' | 'weekly' | 'custom'

export interface SyncScheduleConfig {
  frequency: SyncFrequency
  /** Required when frequency is "custom". Five-field cron expression. */
  cron: string | null
  timezone: string
}

export type SourceStatus = 'active' | 'paused' | 'error' | 'draft'

export type ConfigValue = string | number | boolean | null

export interface Source {
  id: ID
  workspace_id: ID
  name: string
  connector_type: ConnectorType
  status: SourceStatus
  health: HealthStatus
  health_message: string | null
  /** Non-secret configuration values only. */
  config: Record<string, ConfigValue>
  /** State of write-only secret fields, keyed by ConnectorField.key. */
  secrets: Record<string, SecretState>
  destination_schema: string
  selected_tables: SelectedTable[]
  schedule: SyncScheduleConfig
  last_sync_at: ISODateTime | null
  last_successful_sync_at: ISODateTime | null
  last_sync_status: RunStatus | null
  last_sync_duration_seconds: number | null
  last_sync_records: number | null
  total_records: number
  next_sync_at: ISODateTime | null
  created_at: ISODateTime
  updated_at: ISODateTime
  created_by: { id: ID; name: string }
}

export interface SourceListQuery {
  q?: string
  connector_type?: ConnectorType
  status?: SourceStatus
  health?: HealthStatus
}

export interface CreateSourceRequest {
  name: string
  connector_type: ConnectorType
  /** Includes secret values. Sent once over TLS; never persisted in the browser. */
  config: Record<string, ConfigValue>
  destination_schema: string
  selected_tables: SelectedTable[]
  schedule: SyncScheduleConfig
  /** When true the backend queues an initial sync and returns its run id. */
  run_initial_sync?: boolean
}

export interface CreateSourceResponse {
  source: Source
  initial_run_id: ID | null
}

export interface UpdateSourceRequest {
  name?: string
  status?: 'active' | 'paused'
  /** Secret keys: string sets, null clears, omitted keeps. */
  config?: Record<string, ConfigValue>
  selected_tables?: SelectedTable[]
  schedule?: SyncScheduleConfig
}

export interface ConnectionCheck {
  name: string
  status: 'passed' | 'failed' | 'warning'
  message: string
}

export interface TestConnectionResult {
  success: boolean
  latency_ms: number | null
  checks: ConnectionCheck[]
  tested_at: ISODateTime
  error: { code: string; message: string } | null
}

export interface TestNewConnectionRequest {
  connector_type: ConnectorType
  config: Record<string, ConfigValue>
}

export interface SourceSchema {
  name: string
  tables_count: number
}

export interface SourceTable {
  schema: string
  name: string
  label: string | null
  row_count_estimate: number | null
  columns_count: number
  supports_incremental: boolean
  cursor_candidates: string[]
  primary_key: string[]
}

export interface DiscoverRequest {
  connector_type: ConnectorType
  config: Record<string, ConfigValue>
}

export interface DiscoverResponse {
  schemas: SourceSchema[]
  tables: SourceTable[]
}

export interface PreviewColumn {
  name: string
  data_type: string
}

/** Sample rows. Always a bounded sample, never a full extract. */
export interface TablePreview {
  columns: PreviewColumn[]
  rows: Record<string, unknown>[]
  total_rows: number | null
  page: number
  page_size: number
  sampled_at: ISODateTime
}

export interface TriggerSyncRequest {
  mode?: IngestionMode
  /** Restrict the sync to these tables ("schema.table"); all selected tables when omitted. */
  tables?: string[]
}
