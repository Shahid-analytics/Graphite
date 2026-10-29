import { z } from 'zod'

/**
 * Form state for a write-only secret. The stored value is never loaded into the
 * browser: "keep" omits the key, "replace" sends the typed value (empty keeps the
 * stored one) and "clear" sends null.
 */
export interface SecretDraft {
  mode: 'keep' | 'replace' | 'clear'
  value: string
}

export const secretDraftSchema = z.object({
  mode: z.enum(['keep', 'replace', 'clear']),
  value: z.string().max(4096, 'The value is too long.'),
})

export const EMPTY_SECRET: SecretDraft = { mode: 'keep', value: '' }

/** Request value for a secret draft: string to set, null to clear, undefined to keep. */
export function secretPayload(draft: SecretDraft): string | null | undefined {
  if (draft.mode === 'clear') return null
  const value = draft.value.trim()
  return value ? draft.value : undefined
}

/** Error message for a secret draft field: server errors land on the field, client ones on `value`. */
export function secretError(error: { message?: string; value?: { message?: string } } | undefined): string | undefined {
  return error?.message ?? error?.value?.message
}
