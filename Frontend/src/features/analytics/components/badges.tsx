import { CheckCircle2, CircleDashed, Eye, Sparkles } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Dashboard, Report, VisualizationType } from '@/types'
import { visualizationMeta } from '../lib/labels'

export function DashboardStatusBadge({ status }: { status: Dashboard['status'] }) {
  return status === 'published' ? (
    <Badge variant="success">
      <CheckCircle2 aria-hidden />
      Published
    </Badge>
  ) : (
    <Badge variant="default">
      <CircleDashed aria-hidden />
      Draft
    </Badge>
  )
}

export function ReportStatusBadge({ status }: { status: Report['status'] }) {
  if (status === 'published') return <DashboardStatusBadge status="published" />
  if (status === 'in_review') {
    return (
      <Badge variant="info">
        <Eye aria-hidden />
        In review
      </Badge>
    )
  }
  return <DashboardStatusBadge status="draft" />
}

export function OriginBadge({ origin, className }: { origin: Report['origin']; className?: string }) {
  if (origin !== 'ai_suggestion') return null
  return (
    <Badge variant="outline" className={className}>
      <Sparkles aria-hidden />
      AI suggested
    </Badge>
  )
}

export function VisualizationLabel({ value, className }: { value: VisualizationType; className?: string }) {
  const meta = visualizationMeta(value)
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-sm', className)}>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {meta.label}
    </span>
  )
}

/** Monospace chip for column references, measures and filters. */
export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex h-6 max-w-full items-center gap-1 truncate rounded-sm border border-border bg-surface px-1.5 font-mono text-[12px] text-foreground', className)}>
      {children}
    </span>
  )
}
