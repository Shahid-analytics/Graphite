import type {
  ConnectorDefinition,
  CreateSourceRequest,
  CreateSourceResponse,
  DiscoverRequest,
  DiscoverResponse,
  Paginated,
  Run,
  RunListQuery,
  Source,
  SourceListQuery,
  SourceSchema,
  SourceTable,
  TablePreview,
  TestConnectionResult,
  TestNewConnectionRequest,
  TriggerSyncRequest,
  UpdateSourceRequest,
} from '@/types'
import { api } from './api-client'

export const sourcesService = {
  /** Connector catalog (available and upcoming connectors). */
  connectors: () => api.get<ConnectorDefinition[]>('/connectors'),
  list: (workspaceId: string, query: SourceListQuery = {}) => api.get<Source[]>(`/workspaces/${workspaceId}/sources`, { query }),
  get: (sourceId: string) => api.get<Source>(`/sources/${sourceId}`),
  create: (workspaceId: string, payload: CreateSourceRequest) =>
    api.post<CreateSourceResponse>(`/workspaces/${workspaceId}/sources`, payload),
  update: (sourceId: string, payload: UpdateSourceRequest) => api.patch<Source>(`/sources/${sourceId}`, payload),
  remove: (sourceId: string) => api.delete<void>(`/sources/${sourceId}`),
  /** Tests credentials before a source exists (create wizard, onboarding). */
  testNewConnection: (workspaceId: string, payload: TestNewConnectionRequest) =>
    api.post<TestConnectionResult>(`/workspaces/${workspaceId}/sources/test-connection`, payload),
  /** Tests a saved source, optionally with replacement config values. */
  testConnection: (sourceId: string, config?: TestNewConnectionRequest['config']) =>
    api.post<TestConnectionResult>(`/sources/${sourceId}/test-connection`, config ? { config } : {}),
  /** Lists schemas and tables for unsaved credentials (create wizard, onboarding). */
  discover: (workspaceId: string, payload: DiscoverRequest) =>
    api.post<DiscoverResponse>(`/workspaces/${workspaceId}/sources/discover`, payload),
  schemas: (sourceId: string) => api.get<SourceSchema[]>(`/sources/${sourceId}/schemas`),
  tables: (sourceId: string, schema?: string) => api.get<SourceTable[]>(`/sources/${sourceId}/tables`, { query: { schema } }),
  /** `table` is "schema.table". */
  previewTable: (sourceId: string, table: string, query: { page?: number; page_size?: number } = {}) =>
    api.get<TablePreview>(`/sources/${sourceId}/tables/${encodeURIComponent(table)}/preview`, { query }),
  /** Queues an ingestion run (202). Poll GET /runs/{id} for progress. */
  sync: (sourceId: string, payload: TriggerSyncRequest = {}) => api.post<Run>(`/sources/${sourceId}/sync`, payload),
  runs: (sourceId: string, query: RunListQuery = {}) => api.get<Paginated<Run>>(`/sources/${sourceId}/runs`, { query }),
}
