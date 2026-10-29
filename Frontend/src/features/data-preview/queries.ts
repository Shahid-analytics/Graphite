import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { modelsService } from '@/services/models.service'
import type { ModelPreviewQuery } from '@/types'

export const previewKeys = {
  models: (workspaceId: string) => ['models', workspaceId, 'preview-picker'] as const,
  rows: (modelId: string, query: ModelPreviewQuery) => ['models', modelId, 'preview', query] as const,
}

export function usePreviewModels(workspaceId: string) {
  return useQuery({ queryKey: previewKeys.models(workspaceId), queryFn: () => modelsService.list(workspaceId) })
}

/** Server-paginated sample rows. The previous page stays visible while the next one loads. */
export function useModelPreview(modelId: string, query: ModelPreviewQuery) {
  return useQuery({
    queryKey: previewKeys.rows(modelId, query),
    queryFn: () => modelsService.preview(modelId, query),
    placeholderData: keepPreviousData,
  })
}
