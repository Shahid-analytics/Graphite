import { Sparkles, UserRound } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { ProposalStatus, SchemaProposal } from '@/types'
import { STATUS_META } from '../lib/labels'

export function ProposalStatusBadge({ status, className }: { status: ProposalStatus; className?: string }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <Badge variant={meta.variant} className={cn('gap-1', className)}>
      <Icon className={cn('size-3', meta.spin && 'animate-spin')} aria-hidden />
      {meta.label}
    </Badge>
  )
}

/** Origin of a proposal. AI-mapping proposals link to the reviewed mapping set. */
export function OriginBadge({
  proposal,
  workspaceId,
  linked = true,
}: {
  proposal: Pick<SchemaProposal, 'origin' | 'mapping_suggestion_id'>
  workspaceId: string
  linked?: boolean
}) {
  if (proposal.origin === 'ai_mapping') {
    const badge = (
      <Badge variant="outline" className="gap-1">
        <Sparkles className="size-3" aria-hidden />
        AI mapping
      </Badge>
    )
    if (!linked || !proposal.mapping_suggestion_id) return badge
    return (
      <Link
        to={wsPath(workspaceId, 'transformations', 'mapping', proposal.mapping_suggestion_id)}
        onClick={(e) => e.stopPropagation()}
        className="rounded-md hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
        aria-label="AI mapping: open the mapping suggestion set"
      >
        {badge}
      </Link>
    )
  }
  return (
    <Badge variant="default" className="gap-1">
      <UserRound className="size-3" aria-hidden />
      Manual
    </Badge>
  )
}
