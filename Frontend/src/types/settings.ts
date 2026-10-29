import type { Permission, Role, User } from './auth'
import type { HealthStatus, ISODateTime, SecretState } from './common'
import type { MetabaseConnectionStatus } from './analytics'
import type { NotificationType } from './notifications'

export interface Member {
  user: User
  role: Role
  status: 'active' | 'invited'
  joined_at: ISODateTime | null
  last_active_at: ISODateTime | null
}

export interface InviteMemberRequest {
  email: string
  role: Exclude<Role, 'owner'>
}

export interface UpdateMemberRequest {
  role: Exclude<Role, 'owner'>
}

export interface RoleDefinition {
  role: Role
  description: string
  permissions: Permission[]
}

export interface DestinationConfig {
  engine: 'postgres'
  host: string
  port: number
  database: string
  username: string
  password: SecretState
  ssl_mode: 'disable' | 'require' | 'verify-full'
  bronze_schema: string
  silver_schema: string
  gold_schema: string
  status: HealthStatus
  last_tested_at: ISODateTime | null
}

export interface UpdateDestinationRequest {
  host: string
  port: number
  database: string
  username: string
  /** Omit to keep the stored password. */
  password?: string | null
  ssl_mode: DestinationConfig['ssl_mode']
  bronze_schema: string
  silver_schema: string
  gold_schema: string
}

export interface DbtProjectConfig {
  repository_url: string
  branch: string
  project_subdirectory: string
  dbt_version: string
  target: string
  threads: number
  deploy_key: SecretState
  status: HealthStatus
  last_compiled_at: ISODateTime | null
}

export interface UpdateDbtProjectRequest {
  repository_url: string
  branch: string
  project_subdirectory: string
  dbt_version: string
  target: string
  threads: number
  deploy_key?: string | null
}

export interface MetabaseConfig {
  site_url: string
  embedding_secret: SecretState
  api_key: SecretState
  default_collection_id: number | null
  status: MetabaseConnectionStatus
}

export interface UpdateMetabaseConfigRequest {
  site_url: string
  embedding_secret?: string | null
  api_key?: string | null
  default_collection_id?: number | null
}

export type AiProviderName = 'none' | 'openai' | 'anthropic' | 'azure_openai' | 'self_hosted'

export interface AiProviderConfig {
  provider: AiProviderName
  model: string | null
  endpoint_url: string | null
  api_key: SecretState
  /** What data may be sent to the provider. */
  data_sharing: 'metadata_only' | 'metadata_and_samples'
  enabled: boolean
  status: HealthStatus
}

export interface UpdateAiProviderRequest {
  provider: AiProviderName
  model?: string | null
  endpoint_url?: string | null
  api_key?: string | null
  data_sharing: AiProviderConfig['data_sharing']
  enabled: boolean
}

export interface SchedulerDefaults {
  default_timezone: string
  max_concurrent_runs: number
  default_retry_attempts: number
  default_backoff_seconds: number
  quiet_hours: { enabled: boolean; start: string; end: string }
}

export interface NotificationChannelPrefs {
  in_app: boolean
  email: boolean
}

export interface NotificationPreferences {
  email_address: string
  digest: 'off' | 'daily' | 'weekly'
  events: Record<NotificationType, NotificationChannelPrefs>
}

export interface AuditRetentionSettings {
  retention_days: number
  export_enabled: boolean
  include_ip_addresses: boolean
}

export interface IntegrationStatus {
  key: 'warehouse' | 'dbt' | 'metabase' | 'ai_provider' | 'email' | 'scheduler'
  name: string
  status: HealthStatus
  configured: boolean
  message: string | null
  last_checked_at: ISODateTime | null
}

export interface SystemComponentHealth {
  component: string
  status: HealthStatus
  latency_ms: number | null
  message: string | null
  /** When the component was last checked; null if it has never been checked (e.g. Metabase before its first connection test). */
  checked_at: ISODateTime | null
}

export interface SystemHealth {
  overall: HealthStatus
  components: SystemComponentHealth[]
  version: string
}

export interface ConnectionTestResponse {
  success: boolean
  message: string
  tested_at: ISODateTime
}

