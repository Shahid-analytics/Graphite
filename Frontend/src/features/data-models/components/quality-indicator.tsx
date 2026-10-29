import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DataModel, QualityStatus } from '@/types'

/** Passed / failed / warned counts as three compact indicators. */
export function QualityIndicator({ quality, className }: { quality: DataModel['quality']; className?: string }) {
  const total = quality.passed + quality.failed + quality.warned
  if (!total) return <span className={cn('text-xs text-subtle-foreground', className)}>No checks</span>
  const label = `${quality.passed} passed, ${quality.failed} failed, ${quality.warned} warnings`
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-xs tabular', className)} title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className={cn('inline-flex items-center gap-1', quality.passed ? 'text-success' : 'text-subtle-foreground')}>
        <CheckCircle2 className="size-3.5" aria-hidden />
        {quality.passed}
      </span>
      <span aria-hidden className={cn('inline-flex items-center gap-1', quality.failed ? 'font-medium text-danger' : 'text-subtle-foreground')}>
        <XCircle className="size-3.5" aria-hidden />
        {quality.failed}
      </span>
      <span aria-hidden className={cn('inline-flex items-center gap-1', quality.warned ? 'text-warning' : 'text-subtle-foreground')}>
        <AlertTriangle className="size-3.5" aria-hidden />
        {quality.warned}
      </span>
    </span>
  )
}

const STATUS: Record<QualityStatus, { label: string; variant: 'success' | 'danger' | 'warning' | 'outline'; icon: typeof CheckCircle2 | null }> = {
  passed: { label: 'Passed', variant: 'success', icon: CheckCircle2 },
  failed: { label: 'Failed', variant: 'danger', icon: XCircle },
  warning: { label: 'Warning', variant: 'warning', icon: AlertTriangle },
  not_run: { label: 'Not run', variant: 'outline', icon: null },
}

export function QualityStatusBadge({ status }: { status: QualityStatus }) {
  const meta = STATUS[status]
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant}>
      {Icon ? <Icon aria-hidden /> : null}
      {meta.label}
    </Badge>
  )
}
