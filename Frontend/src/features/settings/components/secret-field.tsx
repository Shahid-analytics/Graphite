import { KeyRound, RotateCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { formatDate } from '@/lib/format'
import type { SecretState } from '@/types'
import type { SecretDraft } from '../lib/secrets'
import { SecretInput, SecretTextarea } from './secret-input'

/**
 * Write-only secret control. The stored value is never shown or prefilled: a
 * "Stored" badge describes it, "Replace" reveals an empty input and "Clear"
 * schedules removal on save.
 */
export function SecretField({
  id,
  label,
  state,
  value,
  onChange,
  description,
  error,
  disabled,
  allowClear = true,
  multiline = false,
  placeholder,
  required,
}: {
  id: string
  label: string
  state: SecretState
  value: SecretDraft
  onChange: (next: SecretDraft) => void
  description?: string
  error?: string
  disabled?: boolean
  allowClear?: boolean
  multiline?: boolean
  placeholder?: string
  required?: boolean
}) {
  const showInput = !state.is_set || value.mode === 'replace'
  const hint =
    value.mode === 'replace'
      ? 'Leave empty to keep the stored value. The new value is sent once and never shown again.'
      : !state.is_set
        ? (description ?? 'Write-only: the value is sent once over TLS and never displayed again.')
        : description
  const describedBy = [hint ? `${id}-description` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  const inputA11y = { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined, 'aria-required': required || undefined }
  const input = multiline ? (
    <SecretTextarea
      {...inputA11y}
      value={value.value}
      onChange={(e) => onChange({ mode: state.is_set ? 'replace' : 'keep', value: e.target.value })}
      placeholder={placeholder ?? (state.is_set ? 'Paste the new value' : 'Not set')}
      disabled={disabled}
      autoFocus={value.mode === 'replace'}
    />
  ) : (
    <SecretInput
      {...inputA11y}
      value={value.value}
      onChange={(e) => onChange({ mode: state.is_set ? 'replace' : 'keep', value: e.target.value })}
      placeholder={placeholder ?? (state.is_set ? 'Enter the new value' : 'Not set')}
      disabled={disabled}
      autoFocus={value.mode === 'replace'}
    />
  )

  return (
    <FormField label={label} htmlFor={id} description={hint} error={error} required={required}>
      {showInput ? (
        <div id={`${id}-group`} className="grid gap-2">
          {input}
          {state.is_set ? (
            <div>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ mode: 'keep', value: '' })} disabled={disabled}>
                <RotateCcw aria-hidden />
                Keep stored value
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div id={`${id}-group`} role="group" aria-label={label} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5">
          {value.mode === 'clear' ? (
            <>
              <Badge variant="warning">
                <Trash2 aria-hidden />
                Will be cleared on save
              </Badge>
              <span className="flex-1" />
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ mode: 'keep', value: '' })} disabled={disabled}>
                <RotateCcw aria-hidden />
                Undo
              </Button>
            </>
          ) : (
            <>
              <Badge variant="outline">
                <KeyRound aria-hidden />
                Stored
              </Badge>
              <span className="text-xs text-muted-foreground">{state.updated_at ? `Updated ${formatDate(state.updated_at)}` : 'Value hidden'}</span>
              <span className="flex-1" />
              <Button type="button" variant="outline" size="sm" onClick={() => onChange({ mode: 'replace', value: '' })} disabled={disabled} aria-label={`Replace ${label.toLowerCase()}`}>
                Replace
              </Button>
              {allowClear ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ mode: 'clear', value: '' })} disabled={disabled} aria-label={`Clear ${label.toLowerCase()}`}>
                  Clear
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}
    </FormField>
  )
}
