import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isApiError } from '@/services/api-error'
import { mappingService } from '@/services/mapping.service'
import { modelsService } from '@/services/models.service'
import { settingsService } from '@/services/settings.service'
import { sourcesService } from '@/services/sources.service'
import type {
  CreateMappingSuggestionRequest,
  CreateSchemaProposalRequest,
  MappingSuggestionSet,
  MappingSuggestionSetSummary,
  ProposedSchemaChangeInput,
  ReviewMappingRequest,
} from '@/types'

/** Poll cadence while a suggestion set is still generating. */
export const MAPPING_POLL_MS = 1500

export const mappingKeys = {
  all: ['mapping'] as const,
  list: (workspaceId: string) => ['mapping', workspaceId, 'list'] as const,
  detail: (setId: string) => ['mapping', 'detail', setId] as const,
}

const isGenerating = (set: Pick<MappingSuggestionSet, 'status'> | undefined) => set?.status === 'generating'

export function useMappingSets(workspaceId: string) {
  return useQuery({
    queryKey: mappingKeys.list(workspaceId),
    queryFn: () => mappingService.list(workspaceId),
    refetchInterval: (query) => ((query.state.data as MappingSuggestionSetSummary[] | undefined)?.some(isGenerating) ? MAPPING_POLL_MS : false),
  })
}

export function useMappingSet(setId: string | undefined) {
  return useQuery({
    queryKey: mappingKeys.detail(setId ?? ''),
    queryFn: () => mappingService.get(setId!),
    enabled: Boolean(setId),
    refetchInterval: (query) => (isGenerating(query.state.data as MappingSuggestionSet | undefined) ? MAPPING_POLL_MS : false),
  })
}

export function useCreateMappingSet() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateMappingSuggestionRequest) => mappingService.create(payload),
    onSuccess: (set) => {
      queryClient.setQueryData(mappingKeys.detail(set.id), set)
      return Promise.all([queryClient.invalidateQueries({ queryKey: mappingKeys.list(set.workspace_id) }), queryClient.invalidateQueries({ queryKey: ['audit'] })])
    },
  })
}

export function useReviewMappingSet(setId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ReviewMappingRequest) => mappingService.review(setId, payload),
    onSuccess: (set) => {
      queryClient.setQueryData(mappingKeys.detail(set.id), set)
      return Promise.all(
        [mappingKeys.list(set.workspace_id), ['audit'], ['overview'], ['notifications']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
    },
    // A conflict means someone else changed the set; reload the latest state.
    onError: (error) => {
      if (isApiError(error) && error.status === 409) return queryClient.invalidateQueries({ queryKey: mappingKeys.detail(setId) })
    },
  })
}

export function useAiProviderStatus(workspaceId: string) {
  return useQuery({
    queryKey: ['settings', workspaceId, 'ai-provider'],
    queryFn: () => settingsService.aiProvider(workspaceId),
  })
}

export function useMappingSources(workspaceId: string) {
  return useQuery({
    // Same key as the data sources feature so the cache is shared.
    queryKey: ['sources', 'list', workspaceId, {}],
    queryFn: () => sourcesService.list(workspaceId),
  })
}

export function useSourceTables(sourceId: string | undefined) {
  return useQuery({
    queryKey: ['sources', 'detail', sourceId ?? '', 'tables'],
    queryFn: () => sourcesService.tables(sourceId!),
    enabled: Boolean(sourceId),
  })
}

/** Schema proposals already created from a suggestion set. */
export function useProposalsForMapping(workspaceId: string, setId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['proposals', workspaceId, 'by-mapping', setId],
    queryFn: async () => (await modelsService.listProposals(workspaceId)).filter((p) => p.mapping_suggestion_id === setId),
    enabled,
  })
}

/** Server-side dry run of the schema changes derived from an approved set (renders DDL, reports issues). */
export function useValidateProposalChanges(workspaceId: string, setId: string, changes: ProposedSchemaChangeInput[], enabled: boolean) {
  return useQuery({
    queryKey: ['proposals', workspaceId, 'validate', 'mapping', setId, changes],
    queryFn: () => modelsService.validateProposal(workspaceId, { changes }),
    enabled: enabled && changes.length > 0,
    staleTime: 30_000,
  })
}

export function useCreateProposalFromMapping(workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateSchemaProposalRequest) => modelsService.createProposal(workspaceId, payload),
    onSuccess: () =>
      Promise.all([['proposals'], ['audit'], ['overview'], ['notifications']].map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  })
}
