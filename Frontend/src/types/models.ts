import type { ID, ISODateTime } from './common'

export type DataLayer = 'bronze' | 'silver' | 'gold'
export type ModelRole = 'raw' | 'staging' | 'intermediate' | 'fact' | 'dimension' | 'aggregate'
export type FreshnessStatus = 'fresh' | 'stale' | 'unknown'

export interface ColumnProfile {
  name: string
  data_type: string
  nullable: boolean
  description: string
  is_primary_key: boolean
  is_business_key: boolean
  is_surrogate_key: boolean
  references: { model_id: ID; model_name: string; column: string } | null
  null_fraction: number | null
  distinct_count: number | null
  duplicate_count: number | null
}

export interface SchemaChange {
  id: ID
  detected_at: ISODateTime
  change_type: 'column_added' | 'column_removed' | 'type_changed'
  column: string
  from_type: string | null
  to_type: string | null
  acknowledged: boolean
}

export interface DataModel {
  id: ID
  workspace_id: ID
  database: string
  schema: string
  name: string
  layer: DataLayer
  role: ModelRole
  materialization: 'table' | 'view' | 'incremental'
  description: string
  row_count: number | null
  size_bytes: number | null
  columns_count: number
  primary_key: string[]
  business_keys: string[]
  last_refreshed_at: ISODateTime | null
  freshness_sla_minutes: number | null
  freshness_status: FreshnessStatus
  quality: { passed: number; failed: number; warned: number }
  null_issue_columns: number
  duplicate_rows: number
  schema_changes: SchemaChange[]
  source_id: ID | null
  transformation_id: ID | null
  tags: string[]
  owner: string
}

export interface ModelListQuery {
  q?: string
  layer?: DataLayer
  schema?: string
  role?: ModelRole
  freshness?: FreshnessStatus
  has_schema_changes?: boolean
}

export interface Relationship {
  from_model_id: ID
  from_model: string
  from_column: string
  to_model_id: ID
  to_model: string
  to_column: string
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one'
}

export type LineageNodeKind = 'source' | 'bronze' | 'staging' | 'intermediate' | 'silver' | 'gold' | 'dashboard'

export interface LineageNode {
  id: ID
  name: string
  kind: LineageNodeKind
  /** Id of the underlying resource (source, model, transformation or dashboard). */
  ref_id: ID
  ref_type: 'source' | 'model' | 'transformation' | 'dashboard'
  status: 'ok' | 'warning' | 'error' | 'unknown'
}

export interface LineageEdge {
  from: ID
  to: ID
}

export interface LineageGraph {
  nodes: LineageNode[]
  edges: LineageEdge[]
  /** Node the graph was centred on, when requested for a single resource. */
  focus_id: ID | null
}

export interface ModelPreviewQuery {
  page?: number
  page_size?: number
  sort?: string
  order?: 'asc' | 'desc'
  q?: string
}

export type SchemaChangeType =
  | 'create_table'
  | 'add_column'
  | 'add_relationship'
  | 'add_surrogate_key'
  | 'alter_column'

export interface ProposedSchemaChange {
  id: ID
  change_type: SchemaChangeType
  model_name: string
  layer: DataLayer
  model_role: 'fact' | 'dimension' | null
  summary: string
  columns: { name: string; data_type: string; is_key: boolean; description: string }[]
  relationship: { from_column: string; to_model: string; to_column: string } | null
  /** SQL/DDL rendered by the backend for review only; the frontend never executes it. */
  ddl_preview: string
}

export type ProposalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'applied' | 'applying'

export interface SchemaProposal {
  id: ID
  workspace_id: ID
  title: string
  description: string
  status: ProposalStatus
  origin: 'manual' | 'ai_mapping'
  mapping_suggestion_id: ID | null
  changes: ProposedSchemaChange[]
  created_by: { id: ID; name: string }
  created_at: ISODateTime
  reviewed_by: { id: ID; name: string } | null
  reviewed_at: ISODateTime | null
  review_comment: string | null
  apply_run_id: ID | null
}

export type ProposedSchemaChangeInput = Omit<ProposedSchemaChange, 'id' | 'ddl_preview'>

export interface CreateSchemaProposalRequest {
  title: string
  description?: string
  changes: ProposedSchemaChangeInput[]
  /** Set when the proposal is generated from approved AI mapping suggestions. */
  mapping_suggestion_id?: ID
  submit_for_review?: boolean
}

export interface UpdateSchemaProposalRequest {
  title?: string
  description?: string
  changes?: ProposedSchemaChangeInput[]
  /** Moves a draft into review. */
  submit_for_review?: boolean
}

export interface ValidateSchemaProposalRequest {
  changes: ProposedSchemaChangeInput[]
}

export interface ValidateSchemaProposalResponse {
  valid: boolean
  errors: { change_index: number; message: string }[]
  warnings: { change_index: number; message: string }[]
  /** Changes with backend-rendered ddl_preview for review. */
  changes: ProposedSchemaChange[]
}

export interface ReviewSchemaProposalRequest {
  action: 'approve' | 'reject' | 'request_changes'
  comment?: string
}
