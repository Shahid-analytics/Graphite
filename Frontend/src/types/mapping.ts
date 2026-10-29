import type { ID, ISODateTime } from './common'

export type ReviewDecision = 'pending' | 'accepted' | 'rejected' | 'modified'

export type MappingSetStatus =
  | 'generating'
  | 'ready'
  | 'in_review'
  | 'approved'
  | 'rejected'
  | 'failed'

export interface AiProviderInfo {
  name: string
  model: string
  /** True when suggestions came from the mock service rather than a real provider. */
  simulated: boolean
}

export interface FieldMapping {
  id: ID
  source_table: string
  source_field: string
  source_type: string
  target_model: string
  target_field: string
  target_type: string
  normalization_rule: string | null
  confidence: number
  rationale: string
  decision: ReviewDecision
}

export interface JoinCandidate {
  id: ID
  left_table: string
  left_field: string
  right_table: string
  right_field: string
  cardinality: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many'
  match_rate: number
  confidence: number
  rationale: string
  decision: ReviewDecision
}

export interface KeyCandidate {
  id: ID
  table: string
  fields: string[]
  key_type: 'primary' | 'business' | 'surrogate'
  uniqueness: number
  confidence: number
  rationale: string
  decision: ReviewDecision
}

export interface ProposedColumn {
  name: string
  data_type: string
  expression: string
  description: string
}

export interface ModelProposal {
  id: ID
  name: string
  model_type: 'fact' | 'dimension'
  grain: string
  description: string
  source_tables: string[]
  columns: ProposedColumn[]
  confidence: number
  rationale: string
  decision: ReviewDecision
}

export interface MappingReview {
  action: 'approved' | 'rejected'
  reviewed_by: { id: ID; name: string }
  reviewed_at: ISODateTime
  comment: string | null
}

export interface MappingSuggestionSet {
  id: ID
  workspace_id: ID
  source_id: ID
  source_name: string
  source_tables: string[]
  target_layer: 'silver' | 'gold'
  business_context: string | null
  status: MappingSetStatus
  provider: AiProviderInfo
  created_at: ISODateTime
  created_by: { id: ID; name: string }
  submitted_at: ISODateTime | null
  field_mappings: FieldMapping[]
  join_candidates: JoinCandidate[]
  key_candidates: KeyCandidate[]
  model_proposals: ModelProposal[]
  review: MappingReview | null
}

export type MappingSuggestionSetSummary = Omit<
  MappingSuggestionSet,
  'field_mappings' | 'join_candidates' | 'key_candidates' | 'model_proposals'
> & { counts: { total: number; pending: number; accepted: number; rejected: number; modified: number } }

export interface CreateMappingSuggestionRequest {
  workspace_id: ID
  source_id: ID
  source_tables: string[]
  target_layer: 'silver' | 'gold'
  business_context?: string
}

export type ReviewItemType = 'field_mapping' | 'join' | 'key' | 'model'

export interface ReviewItemDecision {
  item_id: ID
  item_type: ReviewItemType
  decision: Exclude<ReviewDecision, 'pending'>
  /** Edited values for "modified" decisions, e.g. { target_field, normalization_rule }. */
  overrides?: Record<string, unknown>
}

export interface ReviewMappingRequest {
  decisions: ReviewItemDecision[]
  /**
   * save_draft: persist decisions only. submit: move to in_review (all items decided).
   * approve / reject: final reviewer action; requires mappings:approve.
   */
  action: 'save_draft' | 'submit' | 'approve' | 'reject'
  comment?: string
}
