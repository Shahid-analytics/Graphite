import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { DataTable, type Column } from '@/components/tables/data-table'
import { HealthIndicator, RunStatusBadge, SourceStatusBadge } from '@/components/status/status-badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatCompact, formatNumber } from '@/lib/format'
import type { ConnectorDefinition, Source } from '@/types'
import { connectorName, describeSchedule } from '../lib/labels'
import { ConnectorIcon } from './primitives'
import type { useSourceActions } from './source-actions'
import { SourceRowMenu } from './source-row-menu'

export function ConnectionsTable({
  sources,
  connectors,
  actions,
  empty,
}: {
  sources: Source[]
  connectors: ConnectorDefinition[] | undefined
  actions: ReturnType<typeof useSourceActions>
  empty?: ReactNode
}) {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()

  const columns: Column<Source>[] = [
    {
      id: 'name',
      header: 'Source',
      sortValue: (s) => s.name.toLowerCase(),
      cell: (s) => {
        const connector = connectors?.find((c) => c.type === s.connector_type)
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <ConnectorIcon category={connector?.category ?? 'database'} className="size-7" />
            <div className="min-w-0">
              <Link
                to={wsPath(workspaceId, 'sources', s.id)}
                className="block truncate font-medium hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {s.name}
              </Link>
              <p className="truncate text-xs text-muted-foreground">
                {connectorName(connectors, s.connector_type)} <span aria-hidden>·</span> <span className="font-mono">{s.destination_schema}</span>
              </p>
            </div>
          </div>
        )
      },
    },
    { id: 'status', header: 'Status', sortValue: (s) => s.status, cell: (s) => <SourceStatusBadge status={s.status} /> },
    {
      id: 'health',
      header: 'Health',
      sortValue: (s) => s.health,
      cell: (s) =>
        s.health_message ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="cursor-help rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20">
                <HealthIndicator status={s.health} />
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">{s.health_message}</TooltipContent>
          </Tooltip>
        ) : (
          <HealthIndicator status={s.health} />
        ),
    },
    {
      id: 'last_sync',
      header: 'Last sync',
      hideOnMobile: true,
      sortValue: (s) => s.last_sync_at ?? '',
      cell: (s) =>
        s.last_sync_at ? (
          <div className="flex flex-col items-start gap-1">
            <TimeAgo value={s.last_sync_at} className="text-sm" />
            <RunStatusBadge status={s.last_sync_status} />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Never synced</span>
        ),
    },
    {
      id: 'records',
      header: 'Records',
      hideOnMobile: true,
      sortValue: (s) => s.total_records,
      className: 'tabular',
      cell: (s) => (
        <div>
          <p>{formatCompact(s.total_records)}</p>
          <p className="text-xs text-muted-foreground">{s.last_sync_records !== null ? `+${formatNumber(s.last_sync_records)} last sync` : 'No syncs yet'}</p>
        </div>
      ),
    },
    {
      id: 'schedule',
      header: 'Schedule',
      hideOnMobile: true,
      cell: (s) => <span className="text-sm">{describeSchedule(s.schedule, false)}</span>,
    },
    {
      id: 'next',
      header: 'Next sync',
      hideOnMobile: true,
      sortValue: (s) => s.next_sync_at ?? '',
      cell: (s) =>
        s.next_sync_at ? (
          <TimeAgo value={s.next_sync_at} />
        ) : (
          <span className="text-xs text-muted-foreground">{s.status === 'paused' ? 'Paused' : s.schedule.frequency === 'manual' ? 'Manual' : '—'}</span>
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-10 text-right',
      cell: (s) => <SourceRowMenu source={s} actions={actions} />,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={sources}
      getRowId={(s) => s.id}
      onRowClick={(s) => navigate(wsPath(workspaceId, 'sources', s.id))}
      empty={empty}
      caption="Data source connections"
    />
  )
}
