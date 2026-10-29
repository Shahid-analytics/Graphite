import type {
  AiProviderConfig,
  AuditRetentionSettings,
  ConnectionTestResponse,
  DbtProjectConfig,
  DestinationConfig,
  IntegrationStatus,
  InviteMemberRequest,
  Member,
  MetabaseConfig,
  NotificationPreferences,
  RoleDefinition,
  SchedulerDefaults,
  SystemHealth,
  UpdateAiProviderRequest,
  UpdateDbtProjectRequest,
  UpdateDestinationRequest,
  UpdateMemberRequest,
  UpdateMetabaseConfigRequest,
} from '@/types'
import { api } from './api-client'

const ws = (workspaceId: string) => `/workspaces/${workspaceId}`

export const settingsService = {
  // Members and roles
  members: (workspaceId: string) => api.get<Member[]>(`${ws(workspaceId)}/members`),
  invite: (workspaceId: string, payload: InviteMemberRequest) => api.post<Member>(`${ws(workspaceId)}/invitations`, payload),
  updateMember: (workspaceId: string, userId: string, payload: UpdateMemberRequest) =>
    api.patch<Member>(`${ws(workspaceId)}/members/${userId}`, payload),
  removeMember: (workspaceId: string, userId: string) => api.delete<void>(`${ws(workspaceId)}/members/${userId}`),
  roles: (workspaceId: string) => api.get<RoleDefinition[]>(`${ws(workspaceId)}/roles`),

  // Warehouse destination (PostgreSQL Bronze / Silver / Gold)
  destination: (workspaceId: string) => api.get<DestinationConfig>(`${ws(workspaceId)}/destination`),
  updateDestination: (workspaceId: string, payload: UpdateDestinationRequest) =>
    api.put<DestinationConfig>(`${ws(workspaceId)}/destination`, payload),
  testDestination: (workspaceId: string, payload?: UpdateDestinationRequest) =>
    api.post<ConnectionTestResponse>(`${ws(workspaceId)}/destination/test-connection`, payload ?? {}),

  // dbt project
  dbt: (workspaceId: string) => api.get<DbtProjectConfig>(`${ws(workspaceId)}/integrations/dbt`),
  updateDbt: (workspaceId: string, payload: UpdateDbtProjectRequest) => api.put<DbtProjectConfig>(`${ws(workspaceId)}/integrations/dbt`, payload),
  testDbt: (workspaceId: string) => api.post<ConnectionTestResponse>(`${ws(workspaceId)}/integrations/dbt/test-connection`),

  // Metabase configuration (status and test live under /integrations/metabase; see reportsService)
  metabase: (workspaceId: string) => api.get<MetabaseConfig>(`${ws(workspaceId)}/integrations/metabase`),
  updateMetabase: (workspaceId: string, payload: UpdateMetabaseConfigRequest) =>
    api.put<MetabaseConfig>(`${ws(workspaceId)}/integrations/metabase`, payload),

  // AI provider
  aiProvider: (workspaceId: string) => api.get<AiProviderConfig>(`${ws(workspaceId)}/integrations/ai-provider`),
  updateAiProvider: (workspaceId: string, payload: UpdateAiProviderRequest) =>
    api.put<AiProviderConfig>(`${ws(workspaceId)}/integrations/ai-provider`, payload),
  testAiProvider: (workspaceId: string) =>
    api.post<ConnectionTestResponse>(`${ws(workspaceId)}/integrations/ai-provider/test-connection`),

  // Scheduler defaults
  scheduler: (workspaceId: string) => api.get<SchedulerDefaults>(`${ws(workspaceId)}/settings/scheduler`),
  updateScheduler: (workspaceId: string, payload: SchedulerDefaults) =>
    api.put<SchedulerDefaults>(`${ws(workspaceId)}/settings/scheduler`, payload),

  // Audit retention
  auditRetention: (workspaceId: string) => api.get<AuditRetentionSettings>(`${ws(workspaceId)}/settings/audit-retention`),
  updateAuditRetention: (workspaceId: string, payload: AuditRetentionSettings) =>
    api.put<AuditRetentionSettings>(`${ws(workspaceId)}/settings/audit-retention`, payload),

  // Personal notification preferences (per user, per workspace)
  notificationPreferences: (workspaceId: string) =>
    api.get<NotificationPreferences>('/me/notification-preferences', { query: { workspace_id: workspaceId } }),
  updateNotificationPreferences: (workspaceId: string, payload: NotificationPreferences) =>
    api.put<NotificationPreferences>('/me/notification-preferences', payload, { query: { workspace_id: workspaceId } }),

  // Status
  integrations: (workspaceId: string) => api.get<IntegrationStatus[]>(`${ws(workspaceId)}/integrations`),
  systemHealth: (workspaceId: string) => api.get<SystemHealth>(`${ws(workspaceId)}/system-health`),
}
