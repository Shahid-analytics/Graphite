import type { ApiErrorBody, FieldError } from '@/types'

/** Normalised error thrown by the API client in both mock and live modes. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: Record<string, unknown>
  readonly fieldErrors: FieldError[]
  readonly requestId?: string

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { details?: Record<string, unknown>; fieldErrors?: FieldError[]; requestId?: string } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = extra.details
    this.fieldErrors = extra.fieldErrors ?? []
    this.requestId = extra.requestId
  }

  static fromBody(status: number, body: unknown, fallbackMessage: string) {
    const envelope = (body as Partial<ApiErrorBody> | null)?.error
    if (envelope && typeof envelope.code === 'string') {
      return new ApiError(status, envelope.code, envelope.message || fallbackMessage, {
        details: envelope.details,
        fieldErrors: envelope.field_errors,
        requestId: envelope.request_id,
      })
    }
    return new ApiError(status, `http_${status}`, fallbackMessage)
  }

  get isNetworkError() {
    return this.status === 0
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** Human-readable message for any thrown value. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (isApiError(error)) return error.message
  if (error instanceof Error && error.message) return error.message
  return fallback
}
