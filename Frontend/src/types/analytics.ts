import type { HealthStatus, ID, ISODateTime } from './common'
import type { DataLayer } from './models'
import type { AiProviderInfo } from './mapping'

export type BusinessArea = 'sales' | 'finance' | 'operations' | 'marketing' | 'customer' | 'inventory'

export interface DatasetRef {
  model_id: ID
  model_name: string
  layer: DataLayer
}

export interface DashboardPreview {
  kpis: { label: string; value: string; delta: number | null }[]
  series: { label: string; value: number }[]
  series_label: string
}

export interface Dashboard {
  id: ID
  workspace_id: ID
  name: string
  description: string
  business_area: BusinessArea
  status: 'published' | 'draft'
  metabase_dashboard_id: number | null
  cards_count: number
  datasets: DatasetRef[]
  owner: string
  updated_at: ISODateTime
  last_viewed_at: ISODateTime | null
  view_count_30d: number
  /** Whether the signed-in user has favorited the dashboard. Favorites are per user. */
  is_favorite: boolean
  /** Optional summary values for catalog thumbnails, computed by the backend from Gold models. */
  preview: DashboardPreview | null
}

export type VisualizationType = 'line' | 'bar' | 'area' | 'table' | 'kpi' | 'pie' | 'pivot'

export interface ReportMeasure {
  name: string
  expression: string
  aggregation: 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max'
}

export interface ReportFilter {
  field: string
  operator: 'eq' | 'neq' | 'in' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'last_n_days'
  value: string
}

export interface Report {
  id: ID
  workspace_id: ID
  name: string
  description: string
  business_area: BusinessArea
  status: 'draft' | 'in_review' | 'published'
  origin: 'manual' | 'ai_suggestion'
  visualization: VisualizationType
  dataset: DatasetRef
  dimensions: string[]
  measures: ReportMeasure[]
  filters: ReportFilter[]
  metabase_question_id: number | null
  owner: string
  updated_at: ISODateTime
  last_viewed_at: ISODateTime | null
  /** Whether the signed-in user has favorited the report. Favorites are per user. */
  is_favorite: boolean
  /** Provenance when `origin` is "ai_suggestion"; null otherwise or when it is no longer available. */
  suggestion?: ReportSuggestionProvenance | null
}

export interface AnalyticsListQuery {
  q?: string
  business_area?: BusinessArea
  favorite?: boolean
  status?: string
}

export interface CreateReportRequest {
  name: string
  description: string
  business_area: BusinessArea
  visualization: VisualizationType
  dataset_model_id: ID
  dimensions: string[]
  measures: ReportMeasure[]
  filters: ReportFilter[]
  /** Provenance when the draft was created from an AI recommendation. */
  suggestion_id?: ID
  recommendation_id?: ID
}

export interface FavoriteRequest {
  is_favorite: boolean
}

export interface ReportRequest {
  id: ID
  workspace_id: ID
  title: string
  description: string
  business_area: BusinessArea
  priority: 'low' | 'normal' | 'high'
  needed_by: string | null
  status: 'submitted' | 'in_progress' | 'delivered' | 'declined'
  requested_by: { id: ID; name: string }
  created_at: ISODateTime
}

export interface CreateReportRequestRequest {
  title: string
  description: string
  business_area: BusinessArea
  priority: 'low' | 'normal' | 'high'
  needed_by?: string | null
}

export interface ReportRecommendation {
  id: ID
  title: string
  description: string
  dataset: DatasetRef
  dimensions: string[]
  measures: ReportMeasure[]
  filters: ReportFilter[]
  visualization: VisualizationType
  confidence: number
  rationale: string
}

export interface ReportSuggestionRequest {
  workspace_id: ID
  prompt: string
  business_area?: BusinessArea
}

export interface ReportSuggestion {
  id: ID
  prompt: string
  provider: AiProviderInfo
  created_at: ISODateTime
  recommendations: ReportRecommendation[]
}

export type MetabaseConnectionStatus = 'not_configured' | 'connected' | 'unreachable' | 'auth_failed'

export interface MetabaseStatus {
  status: MetabaseConnectionStatus
  health: HealthStatus
  site_url: string | null
  version: string | null
  embedding_enabled: boolean
  last_checked_at: ISODateTime | null
  message: string | null
}

export interface EmbedSession {
  /** Signed, short-lived embed URL generated server-side. Never built in the browser. */
  embed_url: string
  expires_at: ISODateTime
}

/**
 * Provenance of a report created from an AI recommendation. Returned as the
 * optional `suggestion` field of a Report when `origin` is "ai_suggestion".
 */
export interface ReportSuggestionProvenance {
  suggestion_id: ID
  recommendation_id: ID
  prompt: string
  provider: AiProviderInfo
  confidence: number
  suggested_at: ISODateTime
}
