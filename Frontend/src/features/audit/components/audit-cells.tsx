import type { SyntheticEvent } from 'react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { wsPath } from '@/hooks/use-workspace'
import { resourcePath } from '@/lib/resource-links'
import { cn } from '@/lib/utils'
import type { ActorRef, AuditEvent, AuditStatus } from '@/types'
import { actorMeta, isRunId, resourceTypeLabel } from '../lib/labels'

const STATUS_BADGE: Record<AuditStatus, { variant: 'success' | 'danger' | 'warning'; label: string }> = {
  success: { variant: 'success', label: 'Success' },
  failure: { variant: 'danger', label: 'Failure' },
  denied: { variant: 'warning', label: 'Denied' },
}

export function AuditStatusBadge({ status }: { status: AuditStatus }) {
  const meta = STATUS_BADGE[status] ?? { variant: 'warning' as const, label: status }
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}

export function ActorLabel({ actor, showEmail = false, className }: { actor: ActorRef; showEmail?: boolean; className?: string }) {
  const meta = actorMeta(actor.type)
  return (
    <span className={cn('flex min-w-0 items-center gap-2', className)}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground"
            aria-label={meta.label}
            role="img"
          >
            <meta.icon className="size-3.5" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent>{meta.label}</TooltipContent>
      </Tooltip>
      <span className="min-w-0">
        <span className="block truncate">{actor.name}</span>
        {showEmail && actor.email ? <span className="block truncate text-xs text-muted-foreground">{actor.email}</span> : null}
      </span>
    </span>
  )
}

/** Stops row-click handlers when a link inside a clickable table row is used. */
const stop = (event: SyntheticEvent) => event.stopPropagation()

export function ResourceLabel({ workspaceId, resource }: { workspaceId: string; resource: AuditEvent['resource'] }) {
  const path = resourcePath(workspaceId, resource.type, resource.id)
  return (
    <span className="flex min-w-0 flex-col">
      <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{resourceTypeLabel(resource.type)}</span>
      {path ? (
        <Link to={path} onClick={stop} onKeyDown={stop} className="truncate rounded-sm underline-offset-4 hover:underline">
          {resource.name}
        </Link>
      ) : (
        <span className="truncate">{resource.name}</span>
      )}
    </span>
  )
}

export function ExecutionLink({ workspaceId, executionId }: { workspaceId: string; executionId: string | null }) {
  if (!executionId) return <span className="text-subtle-foreground">—</span>
  if (!isRunId(executionId)) return <span className="font-mono text-xs text-muted-foreground">{executionId}</span>
  return (
    <Link
      to={wsPath(workspaceId, 'runs', executionId)}
      onClick={stop}
      onKeyDown={stop}
      className="rounded-sm font-mono text-xs underline-offset-4 hover:underline"
      aria-label={`Open run ${executionId}`}
    >
      {executionId}
    </Link>
  )
}
