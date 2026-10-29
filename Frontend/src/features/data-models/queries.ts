import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { modelsService } from '@/services/models.service'
import { sourcesService } from '@/services/sources.service'
import { transformationsService } from '@/services/transformations.service'
import type { DataModel, LineageGraph, ModelListQuery, ModelPreviewQuery } from '@/types'

export const modelKeys = {
  all: ['models'] as const,
  list: (workspaceId: string, query: ModelListQuery = {}) => ['models', workspaceId, 'list', query] as const,
  detail: (modelId: string) => ['models', 'detail', modelId] as const,
  columns: (modelId: string) => ['models', 'detail', modelId, 'columns'] as const,
  quality: (modelId: string) => ['models', 'detail', modelId, 'quality'] as const,
  lineage: (modelId: string, depth: number) => ['models', 'detail', modelId, 'lineage', depth] as const,
  relationships: (modelId: string) => ['models', 'detail', modelId, 'relationships'] as const,
  preview: (modelId: string, query: ModelPreviewQuery) => ['models', 'detail', modelId, 'preview', query] as const,
  qualitySummary: (workspaceId: string) => ['models', workspaceId, 'quality-summary'] as const,
}

/** Drops empty filter values so an unfiltered list shares its cache entry with the catalog tree. */
export function cleanListQuery(query: ModelListQuery): ModelListQuery {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined && value !== '' && value !== false)) as ModelListQuery
}

/**
 * Keeps the previous result on screen while a new filter or depth loads, but only
 * when it belongs to the same workspace or model (key position `scopeIndex`), so a
 * workspace switch or a jump to another model never shows the old data.
 */
function keepWithinScope<T>(scope: string, scopeIndex: number) {
  return (previous: T | undefined, previousQuery?: { queryKey: QueryKey }) =>
    previousQuery?.queryKey[scopeIndex] === scope ? previous : undefined
}

export function useModels(workspaceId: string, query: ModelListQuery = {}) {
  const clean = cleanListQuery(query)
  return useQuery({
    queryKey: modelKeys.list(workspaceId, clean),
    queryFn: () => modelsService.list(workspaceId, clean),
    placeholderData: keepWithinScope<DataModel[]>(workspaceId, 1),
  })
}

export function useQualitySummary(workspaceId: string) {
  return useQuery({ queryKey: modelKeys.qualitySummary(workspaceId), queryFn: () => modelsService.qualitySummary(workspaceId) })
}

export function useModel(modelId: string) {
  return useQuery({ queryKey: modelKeys.detail(modelId), queryFn: () => modelsService.get(modelId) })
}

export function useModelColumns(modelId: string) {
  return useQuery({ queryKey: modelKeys.columns(modelId), queryFn: () => modelsService.columns(modelId) })
}

export function useModelQualityChecks(modelId: string) {
  return useQuery({ queryKey: modelKeys.quality(modelId), queryFn: () => modelsService.qualityChecks(modelId) })
}

export function useModelLineage(modelId: string, depth: number) {
  return useQuery({
    queryKey: modelKeys.lineage(modelId, depth),
    queryFn: () => modelsService.lineage(modelId, depth),
    placeholderData: keepWithinScope<LineageGraph>(modelId, 2),
  })
}

export function useModelRelationships(modelId: string) {
  return useQuery({ queryKey: modelKeys.relationships(modelId), queryFn: () => modelsService.relationships(modelId) })
}

export function useModelPreview(modelId: string, query: ModelPreviewQuery) {
  return useQuery({ queryKey: modelKeys.preview(modelId, query), queryFn: () => modelsService.preview(modelId, query) })
}

/** Name lookups for the Details tab; the keys mirror the owning domains so their mutations refresh them. */
export function useLinkedSource(sourceId: string | null) {
  return useQuery({
    queryKey: ['sources', 'detail', sourceId ?? ''],
    queryFn: () => sourcesService.get(sourceId!),
    enabled: Boolean(sourceId),
  })
}

export function useLinkedTransformation(transformationId: string | null) {
  return useQuery({
    queryKey: ['transformations', 'detail', transformationId ?? ''],
    queryFn: () => transformationsService.get(transformationId!),
    enabled: Boolean(transformationId),
  })
}

export function useAcknowledgeSchemaChange(modelId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (changeId: string) => modelsService.acknowledgeSchemaChange(modelId, changeId),
    onSuccess: (model: DataModel) => {
      queryClient.setQueryData(modelKeys.detail(modelId), model)
      // Source health is derived from unacknowledged drift on its Bronze tables.
      return Promise.all([['models'], ['sources'], ['overview'], ['audit'], ['search']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
    },
  })
}
