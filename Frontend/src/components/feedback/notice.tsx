import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'info' | 'warning' | 'danger' | 'success' | 'neutral'

const TONES: Record<Tone, { icon: LucideIcon; className: string; iconClass: string }> = {
  info: { icon: Info, className: 'border-info/20 bg-info-soft', iconClass: 'text-info' },
  warning: { icon: AlertTriangle, className: 'border-warning/25 bg-warning-soft', iconClass: 'text-warning' },
  danger: { icon: XCircle, className: 'border-danger/25 bg-danger-soft', iconClass: 'text-danger' },
  success: { icon: CheckCircle2, className: 'border-success/25 bg-success-soft', iconClass: 'text-success' },
  neutral: { icon: Info, className: 'border-border bg-surface', iconClass: 'text-muted-foreground' },
}

/** Inline callout for contextual warnings, integration gaps and guidance. */
export function Notice({
  tone = 'neutral',
  title,
  children,
  action,
  icon,
  className,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  action?: ReactNode
  icon?: LucideIcon
  className?: string
}) {
  const meta = TONES[tone]
  const Icon = icon ?? meta.icon
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'note'}
      className={cn('flex flex-col gap-3 rounded-lg border px-4 py-3 sm:flex-row sm:items-start', meta.className, className)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', meta.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {children ? <div className={cn('text-muted-foreground', title && 'mt-0.5')}>{children}</div> : null}
      </div>
      {action ? <div className="flex shrink-0 gap-2">{action}</div> : null}
    </div>
  )
}
