import type {
  CreateMappingSuggestionRequest,
  MappingSuggestionSet,
  MappingSuggestionSetSummary,
  ReviewMappingRequest,
} from '@/types'
import { api } from './api-client'

export const mappingService = {
  list: (workspaceId: string) => api.get<MappingSuggestionSetSummary[]>(`/workspaces/${workspaceId}/mapping-suggestions`),
  /** Starts generation (202, status "generating"). Poll `get` until status is "ready". */
  create: (payload: CreateMappingSuggestionRequest) => api.post<MappingSuggestionSet>('/ai/mapping-suggestions', payload),
  get: (suggestionId: string) => api.get<MappingSuggestionSet>(`/ai/mapping-suggestions/${suggestionId}`),
  review: (suggestionId: string, payload: ReviewMappingRequest) =>
    api.post<MappingSuggestionSet>(`/ai/mapping-suggestions/${suggestionId}/review`, payload),
}
