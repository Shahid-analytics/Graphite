import type { ConfigValue, ConnectorDefinition, Source, TestConnectionResult } from '@/types'

/**
 * Tested source connection kept in wizard component state only (never in browser
 * storage or the query cache) so step 3 can discover tables and create the source.
 * It includes secret values and is discarded as soon as the source is created.
 */
export interface SourceDraft {
  id: string
  connector: ConnectorDefinition
  config: Record<string, ConfigValue>
  test: TestConnectionResult
}

export interface CreatedSource {
  source: Source
  runId: string | null
}

export function newDraftId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `draft_${Date.now()}`
}
