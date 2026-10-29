import type { ReactNode } from 'react'
import { FormField } from '@/components/ui/form-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export interface SelectOption {
  value: string
  label: ReactNode
}

/**
 * Labelled Radix select. The label, description and error are wired to the
 * trigger button so screen readers announce them.
 */
export function SelectField({
  id,
  label,
  description,
  error,
  required,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  className,
}: {
  id: string
  label: string
  description?: ReactNode
  error?: string
  required?: boolean
  value: string
  onValueChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  className?: string
}) {
  const describedBy = [description ? `${id}-description` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <FormField label={label} htmlFor={id} description={description} error={error} required={required} className={className}>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger id={id} aria-describedby={describedBy} aria-invalid={error ? true : undefined}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FormField>
  )
}
