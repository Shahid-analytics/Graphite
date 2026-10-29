import { Ban, CheckCircle2, Circle, CircleDashed, Loader2, MinusCircle, SkipForward, XCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RunStatus } from '@/types'

/** Run statuses plus the two states used when previewing a pipeline's configuration. */
export type StageDisplayStatus = RunStatus | 'planned' | 'excluded'

export const STAGE_STATUS_META: Record<StageDisplayStatus, { label: string; icon: LucideIcon; iconClass: string; boxClass: string; spin?: boolean }> = {
  queued: { label: 'Queued', icon: CircleDashed, iconClass: 'text-muted-foreground', boxClass: 'border-border bg-background' },
  running: { label: 'Running', icon: Loader2, iconClass: 'text-running', boxClass: 'border-running/40 bg-running-soft', spin: true },
  succeeded: { label: 'Succeeded', icon: CheckCircle2, iconClass: 'text-success', boxClass: 'border-success/30 bg-background' },
  failed: { label: 'Failed', icon: XCircle, iconClass: 'text-danger', boxClass: 'border-danger/40 bg-danger-soft' },
  cancelled: { label: 'Cancelled', icon: Ban, iconClass: 'text-muted-foreground', boxClass: 'border-border bg-surface' },
  skipped: { label: 'Skipped', icon: SkipForward, iconClass: 'text-subtle-foreground', boxClass: 'border-dashed border-border-strong bg-surface' },
  planned: { label: 'Included', icon: Circle, iconClass: 'text-muted-foreground', boxClass: 'border-border-strong bg-background' },
  excluded: { label: 'Not included', icon: MinusCircle, iconClass: 'text-subtle-foreground', boxClass: 'border-dashed border-border bg-surface opacity-70' },
}

export function StageStatusIcon({ status, className }: { status: StageDisplayStatus; className?: string }) {
  const meta = STAGE_STATUS_META[status]
  const Icon = meta.icon
  return <Icon className={cn('size-3.5 shrink-0', meta.iconClass, meta.spin && 'animate-spin', className)} aria-hidden />
}
