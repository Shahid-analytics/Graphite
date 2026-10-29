import { KeyRound } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatRelative } from '@/lib/format'
import type { ConnectorDefinition, ConnectorField, SecretState } from '@/types'
import { SecretInput } from './primitives'

interface FieldProps<T extends FieldValues> {
  field: ConnectorField
  control: Control<T>
  name: Path<T>
  idPrefix: string
  disabled?: boolean
  /** Stored secret state when editing a saved source. */
  secret?: SecretState
}

function ConfigFieldInput<T extends FieldValues>({ field, control, name, idPrefix, disabled, secret }: FieldProps<T>) {
  const {
    field: { value, onChange, onBlur, name: inputName, ref: inputRef },
    fieldState,
  } = useController({ control, name })
  const [replacing, setReplacing] = useState(false)
  const id = `${idPrefix}-${field.key}`
  const error = fieldState.error?.message

  if (field.type === 'boolean') {
    return (
      <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5 sm:col-span-2">
        <Switch
          id={id}
          checked={Boolean(value)}
          onCheckedChange={onChange}
          disabled={disabled}
          aria-describedby={field.help ? `${id}-help` : undefined}
        />
        <div className="grid gap-0.5">
          <Label htmlFor={id}>{field.label}</Label>
          {field.help ? (
            <p id={`${id}-help`} className="text-xs text-muted-foreground">
              {field.help}
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  if (field.secret && secret?.is_set && !replacing) {
    return (
      <div className="grid gap-1.5">
        <Label htmlFor={`${id}-replace`}>{field.label}</Label>
        <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-dashed border-border-strong bg-surface px-3">
          <span className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <KeyRound className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">Stored{secret.updated_at ? ` · updated ${formatRelative(secret.updated_at)}` : ''}</span>
          </span>
          {/* Without aria-label the <label> would name this button "Password", hiding what it does. */}
          <Button id={`${id}-replace`} type="button" variant="link" size="sm" className="text-xs" aria-label={`Replace ${field.label}`} disabled={disabled} onClick={() => setReplacing(true)}>
            Replace
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Secret values are write-only and are never shown again.</p>
      </div>
    )
  }

  const description = field.secret && secret?.is_set ? (
    <span className="flex flex-wrap items-center gap-x-2">
      Leave empty to keep the stored value.
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground"
        onClick={() => {
          onChange('')
          setReplacing(false)
        }}
      >
        Keep stored value
      </button>
    </span>
  ) : (
    field.help
  )

  const text = String(value ?? '')
  const common = {
    name: inputName,
    onBlur,
    disabled,
    placeholder: field.placeholder,
  }

  let element: ReactNode
  if (field.secret || field.type === 'password') {
    element = <SecretInput {...common} id={id} value={text} onChange={(e) => onChange(e.target.value)} ref={inputRef} />
  } else if (field.type === 'select') {
    element = (
      <Select value={text} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} aria-invalid={Boolean(error)} onBlur={onBlur} ref={inputRef}>
          <SelectValue placeholder="Select" />
        </SelectTrigger>
        <SelectContent>
          {field.options?.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else if (field.type === 'textarea') {
    element = <Textarea {...common} id={id} value={text} onChange={(e) => onChange(e.target.value)} ref={inputRef} rows={3} />
  } else {
    element = (
      <Input
        {...common}
        type={field.type === 'number' ? 'text' : field.type === 'url' ? 'url' : 'text'}
        inputMode={field.type === 'number' ? 'numeric' : undefined}
        autoComplete="off"
        id={id}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        ref={inputRef}
      />
    )
  }

  return (
    <FormField label={field.label} htmlFor={id} required={field.required && !(field.secret && secret?.is_set)} description={description} error={error}>
      {element}
    </FormField>
  )
}

/**
 * Renders a connector's configuration fields from `config_fields`. Field names are
 * `${prefix}.${key}` so API field errors such as "config.host" map onto them directly.
 */
export function ConfigFields<T extends FieldValues>({
  connector,
  control,
  prefix = 'config',
  secrets,
  disabled,
  idPrefix = 'cfg',
}: {
  connector: ConnectorDefinition
  control: Control<T>
  prefix?: string
  secrets?: Record<string, SecretState>
  disabled?: boolean
  idPrefix?: string
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {connector.config_fields.map((field) => (
        <ConfigFieldInput
          key={field.key}
          field={field}
          control={control}
          name={`${prefix}.${field.key}` as Path<T>}
          idPrefix={idPrefix}
          disabled={disabled}
          secret={secrets?.[field.key]}
        />
      ))}
    </div>
  )
}
