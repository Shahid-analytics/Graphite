import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from '@tanstack/react-query'
import { workspaceKeys } from '@/hooks/use-workspace'
import { reportsService } from '@/services/reports.service'
import { settingsService } from '@/services/settings.service'
import { sourcesService } from '@/services/sources.service'
import { workspaceService } from '@/services/workspace.service'
import type {
  AuditRetentionSettings,
  InviteMemberRequest,
  MetabaseStatus,
  NotificationPreferences,
  SchedulerDefaults,
  UpdateAiProviderRequest,
  UpdateDbtProjectRequest,
  UpdateDestinationRequest,
  UpdateMemberRequest,
  UpdateMetabaseConfigRequest,
  UpdateWorkspaceRequest,
} from '@/types'

export const settingsKeys = {
  all: ['settings'] as const,
  workspace: (ws: string) => ['settings', ws] as const,
  members: (ws: string) => ['settings', ws, 'members'] as const,
  roles: (ws: string) => ['settings', ws, 'roles'] as const,
  destination: (ws: string) => ['settings', ws, 'destination'] as const,
  dbt: (ws: string) => ['settings', ws, 'dbt'] as const,
  metabase: (ws: string) => ['settings', ws, 'metabase'] as const,
  ai: (ws: string) => ['settings', ws, 'ai-provider'] as const,
  scheduler: (ws: string) => ['settings', ws, 'scheduler'] as const,
  retention: (ws: string) => ['settings', ws, 'audit-retention'] as const,
  notificationPrefs: (ws: string) => ['settings', ws, 'notification-preferences'] as const,
  integrations: (ws: string) => ['settings', ws, 'integrations'] as const,
  systemHealth: (ws: string) => ['settings', ws, 'system-health'] as const,
}

/** Metabase status lives under the analytics domain because reports and dashboards share it. */
export const metabaseStatusKey = (ws: string) => ['analytics', ws, 'metabase-status'] as const
const sourcesSummaryKey = (ws: string) => ['sources', ws, 'settings-summary'] as const

function invalidate(queryClient: QueryClient, ...keys: QueryKey[]) {
  return Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export const useMembers = (ws: string) => useQuery({ queryKey: settingsKeys.members(ws), queryFn: () => settingsService.members(ws) })
export const useRoles = (ws: string) => useQuery({ queryKey: settingsKeys.roles(ws), queryFn: () => settingsService.roles(ws), staleTime: 5 * 60_000 })
export const useDestination = (ws: string) => useQuery({ queryKey: settingsKeys.destination(ws), queryFn: () => settingsService.destination(ws) })
export const useDbtConfig = (ws: string) => useQuery({ queryKey: settingsKeys.dbt(ws), queryFn: () => settingsService.dbt(ws) })
export const useMetabaseConfig = (ws: string) => useQuery({ queryKey: settingsKeys.metabase(ws), queryFn: () => settingsService.metabase(ws) })
export const useAiProvider = (ws: string) => useQuery({ queryKey: settingsKeys.ai(ws), queryFn: () => settingsService.aiProvider(ws) })
export const useSchedulerDefaults = (ws: string) => useQuery({ queryKey: settingsKeys.scheduler(ws), queryFn: () => settingsService.scheduler(ws) })
export const useAuditRetention = (ws: string) => useQuery({ queryKey: settingsKeys.retention(ws), queryFn: () => settingsService.auditRetention(ws) })
export const useNotificationPreferences = (ws: string) =>
  useQuery({ queryKey: settingsKeys.notificationPrefs(ws), queryFn: () => settingsService.notificationPreferences(ws) })
export const useIntegrations = (ws: string) => useQuery({ queryKey: settingsKeys.integrations(ws), queryFn: () => settingsService.integrations(ws) })
export const useSystemHealth = (ws: string) =>
  useQuery({ queryKey: settingsKeys.systemHealth(ws), queryFn: () => settingsService.systemHealth(ws), refetchInterval: 60_000 })
export const useMetabaseStatus = (ws: string) => useQuery({ queryKey: metabaseStatusKey(ws), queryFn: () => reportsService.metabaseStatus(ws) })
export const useSourceConnections = (ws: string) => useQuery({ queryKey: sourcesSummaryKey(ws), queryFn: () => sourcesService.list(ws) })

// ---------------------------------------------------------------------------
// Workspace and members
// ---------------------------------------------------------------------------

export function useUpdateWorkspace(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateWorkspaceRequest) => workspaceService.update(ws, payload),
    onSuccess: (workspace) => {
      queryClient.setQueryData(workspaceKeys.detail(ws), workspace)
      return invalidate(queryClient, workspaceKeys.all, ['audit'], ['overview'])
    },
  })
}

export function useInviteMember(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: InviteMemberRequest) => settingsService.invite(ws, payload),
    onSuccess: () => invalidate(queryClient, settingsKeys.members(ws), ['audit'], ['overview']),
  })
}

export function useUpdateMember(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, payload }: { userId: string; payload: UpdateMemberRequest }) => settingsService.updateMember(ws, userId, payload),
    onSuccess: () => invalidate(queryClient, settingsKeys.members(ws), ['audit'], ['overview']),
  })
}

export function useRemoveMember(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (userId: string) => settingsService.removeMember(ws, userId),
    onSuccess: () => invalidate(queryClient, settingsKeys.members(ws), ['audit'], ['overview']),
  })
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

/** Settings writes change integration status, system health and the audit trail (also shown on the overview). */
function settingsWrite(queryClient: QueryClient, ws: string, ...extra: QueryKey[]) {
  return invalidate(queryClient, settingsKeys.workspace(ws), ['audit'], ['overview'], ...extra)
}

export function useUpdateDestination(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateDestinationRequest) => settingsService.updateDestination(ws, payload),
    onSuccess: (config) => {
      queryClient.setQueryData(settingsKeys.destination(ws), config)
      // Saving a complete destination also completes the onboarding step.
      return settingsWrite(queryClient, ws, workspaceKeys.all)
    },
  })
}

export function useTestDestination(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload?: UpdateDestinationRequest) => settingsService.testDestination(ws, payload),
    onSuccess: () => settingsWrite(queryClient, ws),
  })
}

export function useUpdateDbt(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateDbtProjectRequest) => settingsService.updateDbt(ws, payload),
    onSuccess: (config) => {
      queryClient.setQueryData(settingsKeys.dbt(ws), config)
      return settingsWrite(queryClient, ws)
    },
  })
}

export function useTestDbt(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => settingsService.testDbt(ws),
    onSuccess: () => settingsWrite(queryClient, ws),
  })
}

export function useUpdateMetabase(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateMetabaseConfigRequest) => settingsService.updateMetabase(ws, payload),
    onSuccess: (config) => {
      queryClient.setQueryData(settingsKeys.metabase(ws), config)
      return settingsWrite(queryClient, ws, ['analytics'])
    },
  })
}

export function useTestMetabase(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => reportsService.testMetabase(ws),
    onSuccess: (status: MetabaseStatus) => {
      queryClient.setQueryData(metabaseStatusKey(ws), status)
      return invalidate(queryClient, settingsKeys.metabase(ws), settingsKeys.integrations(ws), settingsKeys.systemHealth(ws), ['audit'], ['overview'])
    },
  })
}

export function useUpdateAiProvider(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateAiProviderRequest) => settingsService.updateAiProvider(ws, payload),
    onSuccess: (config) => {
      queryClient.setQueryData(settingsKeys.ai(ws), config)
      return settingsWrite(queryClient, ws)
    },
  })
}

export function useTestAiProvider(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => settingsService.testAiProvider(ws),
    onSuccess: () => invalidate(queryClient, ['audit'], ['overview']),
  })
}

// ---------------------------------------------------------------------------
// Defaults and preferences
// ---------------------------------------------------------------------------

export function useUpdateScheduler(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: SchedulerDefaults) => settingsService.updateScheduler(ws, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.scheduler(ws), data)
      return settingsWrite(queryClient, ws)
    },
  })
}

export function useUpdateAuditRetention(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: AuditRetentionSettings) => settingsService.updateAuditRetention(ws, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.retention(ws), data)
      return settingsWrite(queryClient, ws)
    },
  })
}

export function useUpdateNotificationPreferences(ws: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: NotificationPreferences) => settingsService.updateNotificationPreferences(ws, payload),
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.notificationPrefs(ws), data)
      return invalidate(queryClient, ['audit'], ['overview'])
    },
  })
}
