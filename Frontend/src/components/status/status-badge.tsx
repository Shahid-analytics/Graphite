import { Ban, CheckCircle2, CircleDashed, CircleSlash, Loader2, PauseCircle, SkipForward, XCircle, type LucideIcon } from 'lucide-react'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FreshnessStatus, HealthStatus, RunStatus } from '@/types'

type Variant = NonNullable<BadgeProps['variant']>

const RUN: Record<RunStatus, { label: string; variant: Variant; icon: LucideIcon; spin?: boolean }> = {
  queued: { label: 'Queued', variant: 'default', icon: CircleDashed },
  running: { label: 'Running', variant: 'running', icon: Loader2, spin: true },
  succeeded: { label: 'Succeeded', variant: 'success', icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'danger', icon: XCircle },
  cancelled: { label: 'Cancelled', variant: 'outline', icon: Ban },
  skipped: { label: 'Skipped', variant: 'outline', icon: SkipForward },
}

export function RunStatusBadge({ status, className }: { status: RunStatus | null | undefined; className?: string }) {
  if (!status) return <span className="text-xs text-subtle-foreground">Never run</span>
  const meta = RUN[status]
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant} className={cn('gap-1', className)}>
      <Icon className={cn('size-3', meta.spin && 'animate-spin')} aria-hidden />
      {meta.label}
    </Badge>
  )
}

const HEALTH: Record<HealthStatus, { label: string; dot: string }> = {
  healthy: { label: 'Healthy', dot: 'bg-success' },
  degraded: { label: 'Degraded', dot: 'bg-warning' },
  unhealthy: { label: 'Unhealthy', dot: 'bg-danger' },
  paused: { label: 'Paused', dot: 'bg-subtle-foreground' },
  unknown: { label: 'Unknown', dot: 'bg-border-strong' },
}

/** Compact dot + label status used in tables. */
export function HealthIndicator({ status, label, className }: { status: HealthStatus; label?: string; className?: string }) {
  const meta = HEALTH[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', className)}>
      <span className={cn('size-2 rounded-full', meta.dot)} aria-hidden />
      <span>{label ?? meta.label}</span>
    </span>
  )
}

export function StatusDot({ tone, pulse, className }: { tone: 'success' | 'warning' | 'danger' | 'running' | 'neutral'; pulse?: boolean; className?: string }) {
  const color = { success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', running: 'bg-running', neutral: 'bg-border-strong' }[tone]
  return <span className={cn('inline-block size-2 shrink-0 rounded-full', color, pulse && 'animate-pulse-dot', className)} aria-hidden />
}

const FRESHNESS: Record<FreshnessStatus, { label: string; variant: Variant }> = {
  fresh: { label: 'Fresh', variant: 'success' },
  stale: { label: 'Stale', variant: 'warning' },
  unknown: { label: 'No SLA', variant: 'outline' },
}

export function FreshnessBadge({ status, className }: { status: FreshnessStatus; className?: string }) {
  const meta = FRESHNESS[status]
  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
    </Badge>
  )
}

/** Medallion layer label. Layers are distinguished by tone, not colour. */
export function LayerBadge({ layer, className }: { layer: string; className?: string }) {
  const tone: Record<string, string> = {
    bronze: 'border-border-strong bg-surface text-muted-foreground',
    silver: 'border-border-strong bg-surface-2 text-foreground',
    gold: 'border-primary bg-primary text-primary-foreground',
    staging: 'border-border bg-background text-muted-foreground',
    intermediate: 'border-border bg-surface text-muted-foreground',
  }
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-sm border px-1.5 text-[11px] font-medium uppercase tracking-wide',
        tone[layer] ?? tone.staging,
        className,
      )}
    >
      {layer}
    </span>
  )
}

export function SourceStatusBadge({ status }: { status: 'active' | 'paused' | 'error' | 'draft' }) {
  const map = {
    active: { label: 'Active', variant: 'success' as Variant, icon: CheckCircle2 },
    paused: { label: 'Paused', variant: 'outline' as Variant, icon: PauseCircle },
    error: { label: 'Error', variant: 'danger' as Variant, icon: XCircle },
    draft: { label: 'Draft', variant: 'default' as Variant, icon: CircleSlash },
  }[status]
  const Icon = map.icon
  return (
    <Badge variant={map.variant} className="gap-1">
      <Icon className="size-3" aria-hidden />
      {map.label}
    </Badge>
  )
}
