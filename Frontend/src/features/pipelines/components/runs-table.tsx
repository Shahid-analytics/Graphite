import { Link, useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { RUN_KIND_LABELS, RUN_TRIGGER_LABELS, STAGE_META } from '@/components/runs/labels'
import { RunStatusBadge } from '@/components/status/status-badge'
import { DataTable, type Column } from '@/components/tables/data-table'
import { wsPath } from '@/hooks/use-workspace'
import { formatDuration, formatNumber } from '@/lib/format'
import type { Run } from '@/types'

interface Pagination {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

/**
 * Server-paginated run list. `showTarget` adds the target and kind columns for
 * workspace-wide lists; pipeline history shows attempt and failure details instead.
 */
export function RunsTable({
  runs,
  workspaceId,
  pagination,
  showTarget = false,
  caption,
}: {
  runs: Run[]
  workspaceId: string
  pagination: Pagination
  showTarget?: boolean
  caption: string
}) {
  const navigate = useNavigate()
  const columns: Column<Run>[] = [
    {
      id: 'id',
      header: 'Run',
      cell: (r) => (
        <Link to={wsPath(workspaceId, 'runs', r.id)} onClick={(e) => e.stopPropagation()} className="font-mono text-[13px] hover:underline">
          {r.id}
        </Link>
      ),
    },
    ...(showTarget
      ? [
          {
            id: 'target',
            header: 'Target',
            cell: (r: Run) => (
              <div className="min-w-0">
                <p className="truncate font-medium">{r.target_name}</p>
                <p className="text-xs text-muted-foreground">{RUN_KIND_LABELS[r.kind]}</p>
              </div>
            ),
          } satisfies Column<Run>,
        ]
      : []),
    { id: 'status', header: 'Status', cell: (r) => <RunStatusBadge status={r.status} /> },
    {
      id: 'trigger',
      header: 'Trigger',
      hideOnMobile: true,
      cell: (r) => (
        <div className="text-sm">
          <p>{RUN_TRIGGER_LABELS[r.trigger]}</p>
          <p className="text-xs text-muted-foreground">{r.triggered_by.name}</p>
        </div>
      ),
    },
    { id: 'started', header: 'Started', cell: (r) => <TimeAgo value={r.started_at ?? r.queued_at} className="text-sm" /> },
    { id: 'duration', header: 'Duration', hideOnMobile: true, cell: (r) => <span className="tabular">{formatDuration(r.duration_seconds)}</span> },
    { id: 'records', header: 'Records', hideOnMobile: true, cell: (r) => <span className="tabular">{formatNumber(r.records_processed)}</span> },
    ...(!showTarget
      ? [
          {
            id: 'detail',
            header: 'Detail',
            hideOnMobile: true,
            cell: (r: Run) =>
              r.error ? (
                <p className="max-w-xs truncate text-xs text-danger" title={r.error.message}>
                  {r.error.stage ? `${STAGE_META[r.error.stage].short}: ` : ''}
                  {r.error.message}
                </p>
              ) : r.attempt > 1 ? (
                <span className="text-xs text-muted-foreground">Attempt {r.attempt}</span>
              ) : (
                <span className="text-subtle-foreground">—</span>
              ),
          } satisfies Column<Run>,
        ]
      : []),
  ]

  return (
    <DataTable
      columns={columns}
      rows={runs}
      getRowId={(r) => r.id}
      onRowClick={(r) => navigate(wsPath(workspaceId, 'runs', r.id))}
      pagination={pagination}
      caption={caption}
    />
  )
}
