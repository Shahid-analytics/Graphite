import type {
  CreateWorkspaceRequest,
  OnboardingState,
  SearchResponse,
  UpdateOnboardingRequest,
  UpdateWorkspaceRequest,
  Workspace,
} from '@/types'
import { api } from './api-client'

export const workspaceService = {
  list: () => api.get<Workspace[]>('/workspaces'),
  create: (payload: CreateWorkspaceRequest) => api.post<Workspace>('/workspaces', payload),
  get: (workspaceId: string) => api.get<Workspace>(`/workspaces/${workspaceId}`),
  update: (workspaceId: string, payload: UpdateWorkspaceRequest) => api.patch<Workspace>(`/workspaces/${workspaceId}`, payload),
  getOnboarding: (workspaceId: string) => api.get<OnboardingState>(`/workspaces/${workspaceId}/onboarding`),
  updateOnboarding: (workspaceId: string, payload: UpdateOnboardingRequest) =>
    api.patch<OnboardingState>(`/workspaces/${workspaceId}/onboarding`, payload),
  search: (workspaceId: string, q: string, signal?: AbortSignal) =>
    api.get<SearchResponse>(`/workspaces/${workspaceId}/search`, { query: { q }, signal }),
}
