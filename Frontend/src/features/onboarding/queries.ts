import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { workspaceKeys } from '@/hooks/use-workspace'
import { reportsService } from '@/services/reports.service'
import { settingsService } from '@/services/settings.service'
import { sourcesService } from '@/services/sources.service'
import { workspaceService } from '@/services/workspace.service'
import type {
  ConfigValue,
  ConnectorType,
  CreateSourceRequest,
  OnboardingStepKey,
  TestNewConnectionRequest,
  UpdateDbtProjectRequest,
  UpdateDestinationRequest,
  UpdateMetabaseConfigRequest,
  Workspace,
} from '@/types'

export const onboardingKeys = {
  connectors: ['sources', 'connectors'] as const,
  /** Keyed by a per-draft id, never by the config itself (which holds secrets). */
  discover: (workspaceId: string, draftId: string) => ['sources', workspaceId, 'discover', draftId] as const,
  destination: (workspaceId: string) => ['settings', workspaceId, 'destination'] as const,
  dbt: (workspaceId: string) => ['settings', workspaceId, 'dbt'] as const,
  metabase: (workspaceId: string) => ['settings', workspaceId, 'metabase'] as const,
}

/*
 * Mutations that carry secret values use gcTime 0 so their variables are dropped
 * from the in-memory mutation cache as soon as nothing observes them.
 */
const SECRET_MUTATION = { gcTime: 0 } as const

export function useConnectors() {
  return useQuery({ queryKey: onboardingKeys.connectors, queryFn: sourcesService.connectors, staleTime: 10 * 60_000 })
}

export function useTestNewConnection(workspaceId: string) {
  return useMutation({
    ...SECRET_MUTATION,
    mutationFn: (payload: TestNewConnectionRequest) => sourcesService.testNewConnection(workspaceId, payload),
  })
}

export function useDiscoverTables(workspaceId: string, draft: { id: string; connectorType: ConnectorType; config: Record<string, ConfigValue> } | null) {
  return useQuery({
    queryKey: onboardingKeys.discover(workspaceId, draft?.id ?? 'none'),
    queryFn: () => sourcesService.discover(workspaceId, { connector_type: draft!.connectorType, config: draft!.config }),
    enabled: Boolean(draft),
    staleTime: Infinity,
    gcTime: 0,
  })
}

export function useCreateSource(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    ...SECRET_MUTATION,
    mutationFn: (payload: CreateSourceRequest) => sourcesService.create(workspaceId, payload),
    onSuccess: () => {
      // Skip the discovery query: refetching it would resend the connection secrets.
      queryClient.invalidateQueries({ queryKey: ['sources'], predicate: (query) => query.queryKey[2] !== 'discover' })
      queryClient.invalidateQueries({ queryKey: ['runs'] })
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useDestination(workspaceId: string) {
  return useQuery({ queryKey: onboardingKeys.destination(workspaceId), queryFn: () => settingsService.destination(workspaceId) })
}

export function useTestDestination(workspaceId: string) {
  return useMutation({
    ...SECRET_MUTATION,
    mutationFn: (payload: UpdateDestinationRequest) => settingsService.testDestination(workspaceId, payload),
  })
}

export function useUpdateDestination(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    ...SECRET_MUTATION,
    mutationFn: (payload: UpdateDestinationRequest) => settingsService.updateDestination(workspaceId, payload),
    onSuccess: (destination) => {
      queryClient.setQueryData(onboardingKeys.destination(workspaceId), destination)
      queryClient.invalidateQueries({ queryKey: ['settings', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useDbtProject(workspaceId: string) {
  return useQuery({ queryKey: onboardingKeys.dbt(workspaceId), queryFn: () => settingsService.dbt(workspaceId) })
}

export function useUpdateDbt(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    ...SECRET_MUTATION,
    mutationFn: (payload: UpdateDbtProjectRequest) => settingsService.updateDbt(workspaceId, payload),
    onSuccess: (dbt) => {
      queryClient.setQueryData(onboardingKeys.dbt(workspaceId), dbt)
      queryClient.invalidateQueries({ queryKey: ['settings', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['transformations'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useTestDbt(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => settingsService.testDbt(workspaceId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useMetabaseConfig(workspaceId: string) {
  return useQuery({ queryKey: onboardingKeys.metabase(workspaceId), queryFn: () => settingsService.metabase(workspaceId) })
}

export function useUpdateMetabase(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    ...SECRET_MUTATION,
    mutationFn: (payload: UpdateMetabaseConfigRequest) => settingsService.updateMetabase(workspaceId, payload),
    onSuccess: (metabase) => {
      queryClient.setQueryData(onboardingKeys.metabase(workspaceId), metabase)
      queryClient.invalidateQueries({ queryKey: ['settings', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useTestMetabase(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => reportsService.testMetabase(workspaceId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['analytics'] })
      queryClient.invalidateQueries({ queryKey: ['settings', workspaceId] })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

/** Marks one onboarding step complete and updates the cached workspace immediately. */
export function useCompleteOnboardingStep(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (step: OnboardingStepKey) => workspaceService.updateOnboarding(workspaceId, { step, completed: true }),
    onSuccess: (onboarding) => {
      queryClient.setQueryData<Workspace>(workspaceKeys.detail(workspaceId), (ws) => (ws ? { ...ws, onboarding } : ws))
      queryClient.invalidateQueries({ queryKey: workspaceKeys.all })
      queryClient.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}
