import { ArrowRight, Database, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { HealthIndicator, SourceStatusBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { usePermission, wsPath } from '@/hooks/use-workspace'
import { useSourceConnections } from '../../queries'
import { DisabledReason } from '../gated-button'

const CONNECTOR_LABELS: Record<string, string> = { salesforce: 'Salesforce', postgres: 'PostgreSQL' }

/** Compact list of source connections; editing happens on the source detail page. */
export function SourceConnections({ workspaceId }: { workspaceId: string }) {
  const sources = useSourceConnections(workspaceId)
  const canCreate = usePermission('sources:write')

  const addButton = canCreate ? (
    <Button asChild size="sm">
      <Link to={wsPath(workspaceId, 'sources', 'new')}>
        <Plus aria-hidden />
        Add a source
      </Link>
    </Button>
  ) : (
    <DisabledReason reason="Requires the sources:write permission">
      <Button size="sm" disabled>
        <Plus aria-hidden />
        Add a source
      </Button>
    </DisabledReason>
  )

  if (sources.isLoading) return <TableSkeleton rows={3} columns={4} />
  if (sources.isError) return <ErrorState error={sources.error} onRetry={() => sources.refetch()} compact />
  if (!sources.data?.length) {
    return (
      <EmptyState
        icon={Database}
        title="No source connections"
        description="Connect Salesforce or a PostgreSQL database to start loading data into the Bronze layer."
        action={addButton}
        compact
      />
    )
  }

  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-background">
      {sources.data.map((source) => (
        <li key={source.id}>
          <Link
            to={wsPath(workspaceId, 'sources', source.id)}
            className="flex flex-col gap-2 px-4 py-3 outline-none hover:bg-surface focus-visible:bg-surface focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-inset sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{source.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {CONNECTOR_LABELS[source.connector_type] ?? source.connector_type} · loads into <span className="font-mono">{source.destination_schema}</span>
                {source.health_message ? ` · ${source.health_message}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <HealthIndicator status={source.health} />
              <SourceStatusBadge status={source.status} />
              <span className="whitespace-nowrap">
                Last sync <TimeAgo value={source.last_sync_at} />
              </span>
              <ArrowRight className="hidden size-4 sm:block" aria-hidden />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
