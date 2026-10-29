import * as React from 'react'

import { cn } from '@/lib/utils'
import { Label } from '@/components/ui/label'

type FormFieldProps = {
  label: string
  htmlFor?: string
  description?: React.ReactNode
  error?: string
  required?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Label + control + optional description and error message. When `htmlFor` is set and
 * the single child is a React element, `id`, `aria-describedby` and `aria-invalid` are
 * wired onto it automatically (existing props on the child take precedence for `id`).
 */
function FormField({ label, htmlFor, description, error, required, className, children }: FormFieldProps) {
  const generatedId = React.useId()
  const baseId = htmlFor ?? generatedId
  const descriptionId = description ? `${baseId}-description` : undefined
  const errorId = error ? `${baseId}-error` : undefined
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined

  let control = children
  if (React.isValidElement<Record<string, unknown>>(children)) {
    const childProps = children.props
    const existing = typeof childProps['aria-describedby'] === 'string' ? childProps['aria-describedby'] : undefined
    control = React.cloneElement(children, {
      id: (childProps.id as string | undefined) ?? htmlFor,
      'aria-describedby': [existing, describedBy].filter(Boolean).join(' ') || undefined,
      'aria-invalid': error ? true : childProps['aria-invalid'],
      'aria-required': required || childProps['aria-required'] || undefined,
    })
  }

  return (
    <div data-slot="form-field" data-invalid={error ? true : undefined} className={cn('grid gap-1.5', className)}>
      <Label htmlFor={htmlFor} className="gap-1">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-subtle-foreground">
            *
          </span>
        ) : null}
      </Label>
      {control}
      {description ? (
        <p id={descriptionId} data-slot="form-field-description" className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} data-slot="form-field-error" role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { FormField }
export type { FormFieldProps }
