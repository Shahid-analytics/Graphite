import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LIVE_POLL_MS } from '@/lib/query-client'
import { mappingService } from '@/services/mapping.service'
import { modelsService } from '@/services/models.service'
import type {
  CreateSchemaProposalRequest,
  ReviewSchemaProposalRequest,
  SchemaProposal,
  UpdateSchemaProposalRequest,
  ValidateSchemaProposalRequest,
} from '@/types'

export const proposalKeys = {
  all: ['proposals'] as const,
  list: (workspaceId: string) => ['proposals', workspaceId, 'list'] as const,
  detail: (proposalId: string) => ['proposals', 'detail', proposalId] as const,
}

export const catalogKeys = {
  models: (workspaceId: string) => ['models', workspaceId, 'catalog'] as const,
  columns: (modelId: string) => ['models', modelId, 'columns'] as const,
}

export function useProposals(workspaceId: string) {
  return useQuery({
    queryKey: proposalKeys.list(workspaceId),
    queryFn: () => modelsService.listProposals(workspaceId),
    refetchInterval: (query) => (query.state.data?.some((p) => p.status === 'applying') ? LIVE_POLL_MS : false),
  })
}

export function useProposal(proposalId: string) {
  return useQuery({
    queryKey: proposalKeys.detail(proposalId),
    queryFn: () => modelsService.getProposal(proposalId),
    refetchInterval: (query) => (query.state.data?.status === 'applying' ? LIVE_POLL_MS : false),
  })
}

/** Silver and Gold models available as targets for relationships, columns and surrogate keys. */
export function useCatalogModels(workspaceId: string) {
  return useQuery({
    queryKey: catalogKeys.models(workspaceId),
    queryFn: () => modelsService.list(workspaceId),
    select: (models) => models.filter((m) => m.layer !== 'bronze'),
  })
}

export function useModelColumns(modelId: string | null | undefined) {
  return useQuery({
    queryKey: catalogKeys.columns(modelId ?? ''),
    queryFn: () => modelsService.columns(modelId!),
    enabled: Boolean(modelId),
    staleTime: 60_000,
  })
}

export function useMappingSet(setId: string | null) {
  return useQuery({
    queryKey: ['mapping', 'detail', setId ?? ''],
    queryFn: () => mappingService.get(setId!),
    enabled: Boolean(setId),
  })
}

export function useValidateProposal(workspaceId: string) {
  return useMutation({
    mutationFn: (payload: ValidateSchemaProposalRequest) => modelsService.validateProposal(workspaceId, payload),
  })
}

function useInvalidateProposals() {
  const queryClient = useQueryClient()
  return (extra: string[][] = []) =>
    Promise.all([proposalKeys.all, ['audit'], ...extra].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

export function useCreateProposal(workspaceId: string) {
  const invalidate = useInvalidateProposals()
  return useMutation({
    mutationFn: (payload: CreateSchemaProposalRequest) => modelsService.createProposal(workspaceId, payload),
    onSuccess: () => invalidate(),
  })
}

export function useUpdateProposal(proposalId: string) {
  const invalidate = useInvalidateProposals()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: UpdateSchemaProposalRequest) => modelsService.updateProposal(proposalId, payload),
    onSuccess: (proposal) => {
      queryClient.setQueryData<SchemaProposal>(proposalKeys.detail(proposalId), proposal)
      return invalidate()
    },
  })
}

export function useReviewProposal(proposalId: string) {
  const invalidate = useInvalidateProposals()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: ReviewSchemaProposalRequest) => modelsService.reviewProposal(proposalId, payload),
    onSuccess: (proposal) => {
      queryClient.setQueryData<SchemaProposal>(proposalKeys.detail(proposalId), proposal)
      return invalidate()
    },
  })
}

export function useApplyProposal(proposalId: string) {
  const invalidate = useInvalidateProposals()
  return useMutation({
    mutationFn: () => modelsService.applyProposal(proposalId),
    onSuccess: () => invalidate([['runs'], ['overview'], ['models']]),
  })
}

export function useDeleteProposal(proposalId: string, workspaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => modelsService.deleteProposal(proposalId),
    // The detail query is left alone: the page navigates away and its cache entry expires.
    onSuccess: () =>
      Promise.all([proposalKeys.list(workspaceId), ['audit']].map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  })
}
