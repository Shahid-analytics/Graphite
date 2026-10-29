import type { ID } from './common'
import type { ResourceType } from './notifications'

export interface SearchResult {
  type: ResourceType
  id: ID
  title: string
  subtitle: string
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
}
