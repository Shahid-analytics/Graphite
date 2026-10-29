import { AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2, XCircle, type LucideIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { MappingSetStatus, ReviewDecision } from '@/types'
import { DECISION_META, STATUS_META } from '../lib/labels'

const STATUS_ICON: Record<MappingSetStatus, LucideIcon> = {
  generating: Loader2,
  ready: CircleDashed,
  in_review: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
  failed: AlertTriangle,
}

export function MappingStatusBadge({ status, className }: { status: MappingSetStatus; className?: string }) {
  const meta = STATUS_META[status]
  const Icon = STATUS_ICON[status]
  return (
    <Badge variant={meta.variant} className={cn('gap-1', className)}>
      <Icon className={cn('size-3', status === 'generating' && 'animate-spin')} aria-hidden />
      {meta.label}
    </Badge>
  )
}

export function DecisionBadge({ decision, unsaved, className }: { decision: ReviewDecision; unsaved?: boolean; className?: string }) {
  const meta = DECISION_META[decision]
  return (
    <Badge variant={meta.variant} className={className}>
      {meta.label}
      {unsaved ? (
        <>
          <span className="size-1.5 rounded-full bg-current" aria-hidden />
          <span className="sr-only">(unsaved)</span>
        </>
      ) : null}
    </Badge>
  )
}
