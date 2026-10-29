import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { isApiError } from '@/services/api-error'

/**
 * Places ApiError.fieldErrors (HTTP 422) on form fields. Indexed or nested backend
 * names ("source_tables[0]", "decisions[0].overrides.target_field") are matched by
 * their first segment, or by the last segment when `nested` is set.
 */
export function applyFieldErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly string[], nested = false) {
  if (!isApiError(error) || !error.fieldErrors.length) return false
  let applied = false
  for (const fieldError of error.fieldErrors) {
    const segments = fieldError.field.split(/[.[\]]+/).filter(Boolean)
    const name = nested ? segments[segments.length - 1] : segments[0]
    if (!name || !fields.includes(name)) continue
    setError(name as Path<T>, { type: 'server', message: fieldError.message }, { shouldFocus: !applied })
    applied = true
  }
  return applied
}
