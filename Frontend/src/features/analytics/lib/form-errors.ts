import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { isApiError } from '@/services/api-error'

/**
 * Places `ApiError.fieldErrors` (HTTP 422) on form fields. `resolve` maps a
 * backend field path (e.g. "measures.0.expression") to a form path, or null
 * when the form has no matching control. Returns messages that could not be
 * placed so the caller can show them in a summary.
 */
export function placeFieldErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  resolve: (field: string) => string | null,
): { placed: number; unplaced: string[] } {
  if (!isApiError(error) || !error.fieldErrors.length) return { placed: 0, unplaced: [] }
  let placed = 0
  const unplaced: string[] = []
  for (const fieldError of error.fieldErrors) {
    const name = resolve(fieldError.field)
    if (!name) {
      unplaced.push(fieldError.message)
      continue
    }
    setError(name as Path<T>, { type: 'server', message: fieldError.message }, { shouldFocus: placed === 0 })
    placed += 1
  }
  return { placed, unplaced }
}
