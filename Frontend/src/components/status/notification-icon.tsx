import { AlertOctagon, CheckCircle2, Clock, GitCompareArrows, RefreshCcw, ShieldAlert, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NotificationSeverity, NotificationType } from '@/types'

const ICONS: Record<NotificationType, LucideIcon> = {
  pipeline_failed: AlertOctagon,
  sync_completed: CheckCircle2,
  repeated_retries: RefreshCcw,
  quality_failed: ShieldAlert,
  schema_changed: GitCompareArrows,
  stale_data: Clock,
}

const TONE: Record<NotificationSeverity, string> = {
  critical: 'text-danger bg-danger-soft border-danger/20',
  warning: 'text-warning bg-warning-soft border-warning/20',
  success: 'text-success bg-success-soft border-success/20',
  info: 'text-muted-foreground bg-surface border-border',
}

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  pipeline_failed: 'Pipeline failure',
  sync_completed: 'Sync completed',
  repeated_retries: 'Repeated retries',
  quality_failed: 'Data quality',
  schema_changed: 'Schema change',
  stale_data: 'Stale data',
}

export function NotificationIcon({ type, severity, className }: { type: NotificationType; severity: NotificationSeverity; className?: string }) {
  const Icon = ICONS[type]
  return (
    <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md border', TONE[severity], className)} aria-hidden>
      <Icon className="size-3.5" />
    </span>
  )
}
