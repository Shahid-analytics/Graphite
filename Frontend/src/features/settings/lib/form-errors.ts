import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { isApiError } from '@/services/api-error'

/**
 * Copies `ApiError.fieldErrors` (HTTP 422) onto react-hook-form fields. `aliases`
 * maps backend field names onto form field names. Returns true when at least one
 * error was placed on a field, so callers can skip the generic error toast.
 */
export function applyFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
  aliases: Record<string, string> = {},
): boolean {
  if (!isApiError(error) || !error.fieldErrors.length) return false
  let applied = false
  for (const fieldError of error.fieldErrors) {
    const name = aliases[fieldError.field] ?? fieldError.field
    if (!fields.includes(name)) continue
    setError(name as Path<T>, { type: 'server', message: fieldError.message }, { shouldFocus: !applied })
    applied = true
  }
  return applied
}
