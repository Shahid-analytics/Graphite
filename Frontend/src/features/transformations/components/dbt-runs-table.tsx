import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { RunStatusBadge } from '@/components/status/status-badge'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { wsPath } from '@/hooks/use-workspace'
import { formatDuration } from '@/lib/format'
import type { Paginated, Run } from '@/types'
import { DBT_RUN_KIND_LABELS, TRIGGER_LABELS } from '../lib/labels'

function columnsFor(workspaceId: string, showModel: boolean): Column<Run>[] {
  const columns: Column<Run>[] = [
    {
      id: 'run',
      header: 'Run',
      cell: (r) => (
        <Link to={wsPath(workspaceId, 'runs', r.id)} onClick={(e) => e.stopPropagation()} className="font-mono text-xs hover:underline">
          {r.id}
        </Link>
      ),
    },
  ]
  if (showModel) {
    columns.push({
      id: 'model',
      header: 'Model',
      cell: (r) =>
        r.transformation_id ? (
          <Link
            to={wsPath(workspaceId, 'transformations', r.transformation_id)}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[13px] hover:underline"
          >
            {r.target_name}
          </Link>
        ) : (
          <span className="font-mono text-[13px]">{r.target_name}</span>
        ),
    })
  }
  columns.push(
    {
      id: 'kind',
      header: 'Command',
      hideOnMobile: true,
      cell: (r) => (
        <Badge variant="outline" className="font-mono font-normal">
          {DBT_RUN_KIND_LABELS[r.kind] ?? r.kind}
        </Badge>
      ),
    },
    { id: 'status', header: 'Status', cell: (r) => <RunStatusBadge status={r.status} /> },
    {
      id: 'trigger',
      header: 'Trigger',
      hideOnMobile: true,
      cell: (r) => (
        <div className="text-sm">
          <span>{TRIGGER_LABELS[r.trigger]}</span>
          {r.attempt > 1 ? <span className="text-muted-foreground"> · attempt {r.attempt}</span> : null}
          <p className="text-xs text-muted-foreground">{r.triggered_by.name}</p>
        </div>
      ),
    },
    { id: 'started', header: 'Started', cell: (r) => <TimeAgo value={r.started_at ?? r.queued_at} className="text-sm" /> },
    {
      id: 'duration',
      header: 'Duration',
      hideOnMobile: true,
      cell: (r) => <span className="text-sm tabular text-muted-foreground">{formatDuration(r.duration_seconds)}</span>,
    },
    {
      id: 'error',
      header: 'Error',
      hideOnMobile: true,
      cell: (r) =>
        r.error ? (
          <p className="line-clamp-2 max-w-sm text-xs text-danger" title={r.error.message}>
            {r.error.message}
          </p>
        ) : (
          <span className="text-xs text-subtle-foreground">—</span>
        ),
    },
  )
  return columns
}

/** Server-paginated table of dbt runs and tests. */
export function DbtRunsTable({
  workspaceId,
  data,
  page,
  onPageChange,
  showModel = false,
  empty,
  dimmed = false,
}: {
  workspaceId: string
  data: Paginated<Run>
  page: number
  onPageChange: (page: number) => void
  showModel?: boolean
  empty: ReactNode
  dimmed?: boolean
}) {
  const navigate = useNavigate()
  const columns = useMemo(() => columnsFor(workspaceId, showModel), [workspaceId, showModel])
  return (
    <DataTable
      caption="dbt run history"
      columns={columns}
      rows={data.items}
      getRowId={(r) => r.id}
      onRowClick={(r) => navigate(wsPath(workspaceId, 'runs', r.id))}
      pagination={{ page, pageSize: data.page_size, total: data.total, onPageChange }}
      empty={empty}
      className={dimmed ? 'opacity-70 transition-opacity' : undefined}
    />
  )
}
