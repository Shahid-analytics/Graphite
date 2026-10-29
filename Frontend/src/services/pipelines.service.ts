import type {
  CreatePipelineRequest,
  Paginated,
  Pipeline,
  PipelineListQuery,
  Run,
  RunListQuery,
  TriggerPipelineRunRequest,
  UpdatePipelineRequest,
} from '@/types'
import { api } from './api-client'

export const pipelinesService = {
  list: (workspaceId: string, query: PipelineListQuery = {}) => api.get<Pipeline[]>(`/workspaces/${workspaceId}/pipelines`, { query }),
  get: (pipelineId: string) => api.get<Pipeline>(`/pipelines/${pipelineId}`),
  create: (workspaceId: string, payload: CreatePipelineRequest) => api.post<Pipeline>(`/workspaces/${workspaceId}/pipelines`, payload),
  update: (pipelineId: string, payload: UpdatePipelineRequest) => api.patch<Pipeline>(`/pipelines/${pipelineId}`, payload),
  remove: (pipelineId: string) => api.delete<void>(`/pipelines/${pipelineId}`),
  /** Queues a pipeline run (202). Poll GET /runs/{id} for progress. */
  trigger: (pipelineId: string, payload: TriggerPipelineRunRequest = {}) => api.post<Run>(`/pipelines/${pipelineId}/runs`, payload),
  runs: (pipelineId: string, query: RunListQuery = {}) => api.get<Paginated<Run>>(`/pipelines/${pipelineId}/runs`, { query }),
}
