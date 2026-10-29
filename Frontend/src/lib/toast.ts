import { toast } from 'sonner'
import { errorMessage, isApiError } from '@/services/api-error'

const MAX_FIELD_MESSAGES = 3

export function toastSuccess(message: string, description?: string) {
  toast.success(message, { description })
}

export interface ToastErrorOptions {
  /** Fields whose errors the caller already shows next to a form input; they are left out of the toast. */
  shownFields?: readonly string[]
}

/** Field messages of a 422 the caller could not place on a form: at most three, then "and N more". */
export function fieldErrorSummary(error: unknown, shownFields: readonly string[] = []): string | null {
  if (!isApiError(error)) return null
  const messages = [...new Set(error.fieldErrors.filter((f) => !shownFields.includes(f.field)).map((f) => f.message.trim().replace(/\.$/, '')))].filter(Boolean)
  if (!messages.length) return null
  const shown = messages.slice(0, MAX_FIELD_MESSAGES)
  const rest = messages.length - shown.length
  return `${shown.join('; ')}${rest ? `; and ${rest} more` : ''}.`
}

/**
 * Surfaces an API failure. Includes the error code so support can trace it, and
 * the field messages of a validation error that no form input displays.
 */
export function toastError(error: unknown, fallbackTitle = 'Action failed', options: ToastErrorOptions = {}) {
  const fields = fieldErrorSummary(error, options.shownFields)
  const message = fields ? `${errorMessage(error)} ${fields}` : errorMessage(error)
  const description = isApiError(error) && error.code ? `${message} (${error.code})` : message
  toast.error(fallbackTitle, { description })
}

export function toastInfo(message: string, description?: string) {
  toast(message, { description })
}
