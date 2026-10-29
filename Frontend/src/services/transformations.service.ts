import type {
  DbtProject,
  Paginated,
  Run,
  RunListQuery,
  RunTransformationRequest,
  TestResult,
  Transformation,
  TransformationListQuery,
  TransformationSummary,
  UpdateTransformationRequest,
} from '@/types'
import { api } from './api-client'

export const transformationsService = {
  project: (workspaceId: string) => api.get<DbtProject>(`/workspaces/${workspaceId}/dbt-project`),
  list: (workspaceId: string, query: TransformationListQuery = {}) =>
    api.get<TransformationSummary[]>(`/workspaces/${workspaceId}/transformations`, { query }),
  get: (transformationId: string) => api.get<Transformation>(`/transformations/${transformationId}`),
  /** Saves SQL or documentation; the backend commits to the dbt repository. */
  update: (transformationId: string, payload: UpdateTransformationRequest) =>
    api.patch<Transformation>(`/transformations/${transformationId}`, payload),
  /** Queues `dbt run` for the model (202). */
  run: (transformationId: string, payload: RunTransformationRequest = {}) =>
    api.post<Run>(`/transformations/${transformationId}/run`, payload),
  /** Queues `dbt test` for the model (202). */
  test: (transformationId: string) => api.post<Run>(`/transformations/${transformationId}/test`),
  runs: (transformationId: string, query: RunListQuery = {}) =>
    api.get<Paginated<Run>>(`/transformations/${transformationId}/runs`, { query }),
  tests: (transformationId: string) => api.get<TestResult[]>(`/transformations/${transformationId}/tests`),
}
