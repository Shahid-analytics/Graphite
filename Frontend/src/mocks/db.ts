import type {
  AiProviderConfig,
  AuditEvent,
  AuditRetentionSettings,
  ColumnProfile,
  ConnectorDefinition,
  Dashboard,
  DataModel,
  DbtProject,
  DbtProjectConfig,
  DestinationConfig,
  MappingSuggestionSet,
  MetabaseConfig,
  MetabaseConnectionStatus,
  Notification,
  NotificationPreferences,
  OnboardingState,
  Pipeline,
  Plan,
  QualityCheck,
  Relationship,
  Report,
  ReportRequest,
  ReportSuggestion,
  Role,
  Run,
  RunError,
  Schedule,
  SchedulerDefaults,
  SchemaProposal,
  Source,
  SourceTable,
  StageKey,
  Transformation,
  User,
} from '@/types'

export interface WorkspaceRecord {
  id: string
  name: string
  slug: string
  industry: string | null
  region: string
  timezone: string
  plan: Plan
  created_at: string
  onboarding: OnboardingState
}

export interface MembershipRecord {
  user_id: string
  workspace_id: string
  role: Role
  status: 'active' | 'invited'
  joined_at: string | null
  last_active_at: string | null
}

/** Simulation state for runs created while the demo is open. */
export interface SimState {
  /** Epoch ms at which the run leaves the queue. */
  start_ms: number
  queued_ms: number
  durations_ms: number[]
  /** Index of the stage that fails, or -1 for success. */
  fail_index: number
  fail_error: RunError | null
  /** Stage keys that are skipped (reported as "skipped"). */
  skipped: StageKey[]
  cancelled_at_ms: number | null
  settled: boolean
  total_records: number
  /** Records each table loads once it succeeds; they add up to `total_records`. */
  table_records?: number[]
  /** Run this one waits for (schedule overlap policy "queue"); it starts once that run is terminal. */
  queued_behind?: string | null
}

export type RunRecord = Run & { sim: SimState | null }

export interface WorkspaceSettings {
  destination: DestinationConfig
  dbt: DbtProjectConfig
  metabase: MetabaseConfig
  ai: AiProviderConfig
  scheduler: SchedulerDefaults
  retention: AuditRetentionSettings
}

export type DashboardRecord = Omit<Dashboard, 'is_favorite'>
export type ReportRecord = Omit<Report, 'is_favorite'>

export interface FavoriteSet {
  dashboard_ids: string[]
  report_ids: string[]
}

export interface MetabaseCheck {
  checked_at: string
  status: MetabaseConnectionStatus
}

export interface MockDb {
  users: User[]
  memberships: MembershipRecord[]
  workspaces: WorkspaceRecord[]
  connectors: ConnectorDefinition[]
  sources: Source[]
  /** Discoverable tables per source id. */
  sourceTables: Record<string, SourceTable[]>
  /** Simulated source failures: source id -> error raised at the source_connect stage. */
  sourceFailures: Record<string, RunError>
  runs: RunRecord[]
  pipelines: Pipeline[]
  dbtProjects: DbtProject[]
  transformations: Transformation[]
  models: DataModel[]
  columns: Record<string, ColumnProfile[]>
  /** Upstream dependencies per model id (model ids, or a source id for Bronze tables). */
  lineage: Record<string, string[]>
  qualityChecks: QualityCheck[]
  relationships: Relationship[]
  schedules: Schedule[]
  /** Shared dashboard records; is_favorite is computed per user from `favorites`. */
  dashboards: DashboardRecord[]
  reports: ReportRecord[]
  reportRequests: ReportRequest[]
  reportSuggestions: ReportSuggestion[]
  mappingSets: MappingSuggestionSet[]
  /** Epoch ms when a generating mapping set becomes ready. */
  mappingReadyAt: Record<string, number>
  proposals: SchemaProposal[]
  auditEvents: AuditEvent[]
  notifications: Notification[]
  settings: Record<string, WorkspaceSettings>
  notificationPrefs: Record<string, NotificationPreferences>
  /** Favorites per "userId:workspaceId". */
  favorites: Record<string, FavoriteSet>
  /** Last Metabase connection test per workspace id. */
  metabaseChecks: Record<string, MetabaseCheck>
}
