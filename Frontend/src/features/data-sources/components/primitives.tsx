import { Eye, EyeOff } from 'lucide-react'
import { Children, useState, type ComponentProps, type ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ConnectorCategory } from '@/types'
import { CATEGORY_ICONS } from '../lib/labels'

/** Category icon in a small bordered tile. */
export function ConnectorIcon({ category, className }: { category: ConnectorCategory; className?: string }) {
  const Icon = CATEGORY_ICONS[category]
  return (
    <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface', className)} aria-hidden>
      <Icon className="size-4 text-muted-foreground" />
    </span>
  )
}

/**
 * Write-only secret input with a show/hide toggle. Values live only in form state
 * and are never written to browser storage.
 */
export function SecretInput({ className, disabled, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn('pr-10', className)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        disabled={disabled}
        aria-label={visible ? 'Hide value' : 'Show value'}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

/**
 * Button that explains why it is disabled. When `reason` is set the button is disabled
 * and a tooltip (reachable by keyboard) states the reason.
 */
export function GatedButton({ reason, children, ...props }: ButtonProps & { reason?: string | null }) {
  if (!reason) return <Button {...props}>{children}</Button>
  // Name the wrapper after the button: its aria-label, or the text next to its icon.
  const text = Children.toArray(children)
    .filter((child): child is string => typeof child === 'string')
    .join(' ')
    .trim()
  const name = props['aria-label'] ?? (text || 'Action')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/20" aria-label={`${name} unavailable: ${reason}`}>
          <Button {...props} disabled aria-hidden tabIndex={-1}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  )
}

/** Menu item body with an optional muted explanation underneath (used for disabled items). */
export function MenuItemLabel({ children, reason }: { children: ReactNode; reason?: string | null }) {
  if (!reason) return <>{children}</>
  return (
    <span className="flex flex-col">
      <span>{children}</span>
      <span className="text-xs text-muted-foreground">{reason}</span>
    </span>
  )
}

export function permissionReason(permission: string) {
  return `Your role does not include the "${permission}" permission. Ask a workspace admin.`
}
