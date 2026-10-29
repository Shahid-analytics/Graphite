/**
 * Shared API conventions. JSON uses snake_case keys (FastAPI / Pydantic default),
 * ISO 8601 UTC timestamps and opaque, prefixed string identifiers.
 */
export type ID = string
/** ISO 8601 timestamp in UTC, e.g. "2026-10-28T09:15:00Z". */
export type ISODateTime = string

export interface Paginated<T> {
  items: T[]
  page: number
  page_size: number
  total: number
}

export interface PageQuery {
  page?: number
  page_size?: number
  /** Field to sort by; prefix with "-" for descending (e.g. "-created_at"). */
  sort?: string
  q?: string
}

export interface FieldError {
  field: string
  message: string
}

/** Standard error envelope returned by every non-2xx response. */
export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
    field_errors?: FieldError[]
    request_id?: string
  }
}

/**
 * Write-only secret fields are never returned by the API. Responses describe
 * whether a value is stored; requests send a string to set it, null to clear it,
 * or omit the key to keep the existing value.
 */
export interface SecretState {
  is_set: boolean
  updated_at: ISODateTime | null
}

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'paused' | 'unknown'

export interface ActorRef {
  type: 'user' | 'service' | 'scheduler' | 'api_key'
  id: ID
  name: string
  email?: string | null
}
