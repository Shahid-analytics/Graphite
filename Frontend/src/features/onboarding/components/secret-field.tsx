import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { cloneElement, useState, type ComponentProps, type ReactElement } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SecretState } from '@/types'

/**
 * Write-only secret control. When a value is already stored it shows "Stored" and a
 * Replace button instead of an input; the stored value is never fetched or shown.
 * `children` is the input rendered while entering a new value. The `id` and aria
 * attributes that FormField injects are forwarded to that input.
 */
export function StoredSecret({
  state,
  replacing,
  onReplacingChange,
  disabled,
  children,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
  'aria-required': required,
}: {
  state: SecretState | undefined
  replacing: boolean
  onReplacingChange: (replacing: boolean) => void
  disabled?: boolean
  children: ReactElement<Record<string, unknown>>
  id?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
}) {
  if (state?.is_set && !replacing) {
    return (
      <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-surface pr-1 pl-3 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <KeyRound className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span className="font-medium">Stored</span>
          {state.updated_at ? <span className="truncate text-xs text-muted-foreground">updated {formatRelative(state.updated_at)}</span> : null}
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => onReplacingChange(true)} disabled={disabled} aria-describedby={describedBy}>
          Replace
        </Button>
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      {cloneElement(children, {
        id: (children.props.id as string | undefined) ?? id,
        'aria-describedby': describedBy,
        'aria-invalid': invalid,
        'aria-required': required,
      })}
      {state?.is_set ? (
        <Button type="button" variant="link" size="sm" className="text-xs text-muted-foreground" onClick={() => onReplacingChange(false)} disabled={disabled}>
          Keep the stored value
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Multi-line secret input (SSH deploy keys). Masked by default; password inputs
 * cannot hold the line breaks a private key needs.
 */
export function SecretTextarea({ className, disabled, ...props }: ComponentProps<'textarea'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Textarea
        {...props}
        disabled={disabled}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        className={cn('min-h-24 pr-10 font-mono text-xs', !visible && '[-webkit-text-security:disc]', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Hide value' : 'Show value'}
        aria-pressed={visible}
        className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}
