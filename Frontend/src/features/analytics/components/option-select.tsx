import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/** Labelled Radix select for small enumerations inside forms. */
export function OptionSelect<V extends string>({
  id,
  value,
  onChange,
  options,
  placeholder = 'Select',
  invalid,
  ariaLabel,
  'aria-describedby': describedBy,
  'aria-invalid': ariaInvalid,
  size = 'default',
  className,
}: {
  id?: string
  value: V | '' | undefined
  onChange: (value: V) => void
  options: { value: V; label: string }[]
  placeholder?: string
  invalid?: boolean
  ariaLabel?: string
  /** Wired automatically when rendered inside FormField. */
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  size?: 'default' | 'sm'
  className?: string
}) {
  return (
    <Select value={value || undefined} onValueChange={(next) => onChange(next as V)}>
      <SelectTrigger id={id} size={size} className={className} aria-invalid={invalid || ariaInvalid || undefined} aria-describedby={describedBy} aria-label={ariaLabel}>
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
  )
}
