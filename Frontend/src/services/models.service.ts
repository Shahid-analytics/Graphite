import type {
  ColumnProfile,
  CreateSchemaProposalRequest,
  DataModel,
  LineageGraph,
  ModelListQuery,
  ModelPreviewQuery,
  QualityCheck,
  QualitySummary,
  Relationship,
  ReviewSchemaProposalRequest,
  Run,
  SchemaProposal,
  TablePreview,
  UpdateSchemaProposalRequest,
  ValidateSchemaProposalRequest,
  ValidateSchemaProposalResponse,
} from '@/types'
import { api } from './api-client'

export const modelsService = {
  list: (workspaceId: string, query: ModelListQuery = {}) => api.get<DataModel[]>(`/workspaces/${workspaceId}/models`, { query }),
  get: (modelId: string) => api.get<DataModel>(`/models/${modelId}`),
  columns: (modelId: string) => api.get<ColumnProfile[]>(`/models/${modelId}/columns`),
  preview: (modelId: string, query: ModelPreviewQuery = {}) => api.get<TablePreview>(`/models/${modelId}/preview`, { query }),
  lineage: (modelId: string, depth = 3) => api.get<LineageGraph>(`/models/${modelId}/lineage`, { query: { depth } }),
  relationships: (modelId: string) => api.get<Relationship[]>(`/models/${modelId}/relationships`),
  qualityChecks: (modelId: string) => api.get<QualityCheck[]>(`/models/${modelId}/quality-checks`),
  acknowledgeSchemaChange: (modelId: string, changeId: string) =>
    api.post<DataModel>(`/models/${modelId}/schema-changes/${changeId}/acknowledge`),
  workspaceLineage: (workspaceId: string) => api.get<LineageGraph>(`/workspaces/${workspaceId}/lineage`),
  workspaceRelationships: (workspaceId: string) => api.get<Relationship[]>(`/workspaces/${workspaceId}/relationships`),
  qualitySummary: (workspaceId: string) => api.get<QualitySummary>(`/workspaces/${workspaceId}/quality-summary`),

  // Schema proposals (facts, dimensions, relationships, surrogate keys)
  listProposals: (workspaceId: string, status?: string) =>
    api.get<SchemaProposal[]>(`/workspaces/${workspaceId}/schema-proposals`, { query: { status } }),
  getProposal: (proposalId: string) => api.get<SchemaProposal>(`/schema-proposals/${proposalId}`),
  validateProposal: (workspaceId: string, payload: ValidateSchemaProposalRequest) =>
    api.post<ValidateSchemaProposalResponse>(`/workspaces/${workspaceId}/schema-proposals/validate`, payload),
  createProposal: (workspaceId: string, payload: CreateSchemaProposalRequest) =>
    api.post<SchemaProposal>(`/workspaces/${workspaceId}/schema-proposals`, payload),
  updateProposal: (proposalId: string, payload: UpdateSchemaProposalRequest) =>
    api.patch<SchemaProposal>(`/schema-proposals/${proposalId}`, payload),
  reviewProposal: (proposalId: string, payload: ReviewSchemaProposalRequest) =>
    api.post<SchemaProposal>(`/schema-proposals/${proposalId}/review`, payload),
  /** Queues a schema_apply run (202) for an approved proposal. */
  applyProposal: (proposalId: string) => api.post<Run>(`/schema-proposals/${proposalId}/apply`),
  deleteProposal: (proposalId: string) => api.delete<void>(`/schema-proposals/${proposalId}`),
}
