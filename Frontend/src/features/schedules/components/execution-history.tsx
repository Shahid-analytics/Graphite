import { History } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { RunStatusBadge } from '@/components/status/status-badge'
import { DataTable, FilterSelect, TableToolbar, type Column } from '@/components/tables/data-table'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDuration, formatNumber } from '@/lib/format'
import type { Run, RunStatus, Schedule } from '@/types'
import { useScheduleRuns } from '../queries'
import { StopPropagation } from './stop-propagation'

const PAGE_SIZE = 10

const STATUS_OPTIONS: { value: RunStatus; label: string }[] = [
  { value: 'running', label: 'Running' },
  { value: 'queued', label: 'Queued' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'skipped', label: 'Skipped' },
]

const TRIGGER_LABEL: Record<Run['trigger'], string> = {
  schedule: 'Scheduled',
  manual: 'Run now',
  retry: 'Retry',
  onboarding: 'Onboarding',
  api: 'API',
}

/** Runs triggered by this schedule, including "Run now" executions. Server-paginated. */
export function ExecutionHistory({ schedule }: { schedule: Schedule }) {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const query = { status: status === 'all' ? undefined : (status as RunStatus), page, page_size: PAGE_SIZE }
  const runs = useScheduleRuns(schedule.id, query)

  const columns: Column<Run>[] = [
    {
      id: 'run',
      header: 'Run',
      cell: (run) => (
        <StopPropagation>
          <Link to={wsPath(workspaceId, 'runs', run.id)} className="font-mono text-[13px] hover:underline">
            {run.id}
          </Link>
        </StopPropagation>
      ),
    },
    { id: 'status', header: 'Status', cell: (run) => <RunStatusBadge status={run.status} /> },
    {
      id: 'trigger',
      header: 'Trigger',
      hideOnMobile: true,
      cell: (run) => (
        <span className="text-sm">
          {TRIGGER_LABEL[run.trigger]}
          {run.attempt > 1 ? <span className="text-xs text-muted-foreground"> · attempt {run.attempt}</span> : null}
        </span>
      ),
    },
    { id: 'started', header: 'Started', cell: (run) => <TimeAgo value={run.started_at ?? run.queued_at} className="text-sm" /> },
    { id: 'duration', header: 'Duration', hideOnMobile: true, cell: (run) => <span className="text-sm tabular">{formatDuration(run.duration_seconds)}</span> },
    {
      id: 'records',
      header: 'Records',
      hideOnMobile: true,
      className: 'text-right',
      headerClassName: 'text-right',
      cell: (run) => <span className="text-sm tabular">{run.records_processed === null ? '—' : formatNumber(run.records_processed)}</span>,
    },
    {
      id: 'error',
      header: 'Error',
      hideOnMobile: true,
      className: 'max-w-[22rem]',
      cell: (run) =>
        run.error ? (
          <span className="line-clamp-2 text-xs text-danger" title={run.error.message}>
            {run.error.message}
          </span>
        ) : (
          <span className="text-xs text-subtle-foreground">—</span>
        ),
    },
  ]

  const body = () => {
    if (runs.isLoading) return <TableSkeleton rows={5} columns={5} />
    if (runs.isError) return <ErrorState compact error={runs.error} title="Could not load execution history" onRetry={() => void runs.refetch()} />
    const data = runs.data
    if (!data || (!data.items.length && status === 'all')) {
      return (
        <EmptyState
          compact
          icon={History}
          title="No executions yet"
          description={
            schedule.enabled
              ? 'Runs appear here once the backend scheduler triggers this schedule, or when you use Run now.'
              : 'This schedule is disabled. Enable it, or use Run now to trigger the target once.'
          }
        />
      )
    }
    return (
      <DataTable
        columns={columns}
        rows={data.items}
        getRowId={(run) => run.id}
        onRowClick={(run) => navigate(wsPath(workspaceId, 'runs', run.id))}
        caption={`Executions of ${schedule.name}`}
        pagination={{ page: data.page, pageSize: data.page_size, total: data.total, onPageChange: setPage }}
      />
    )
  }

  return (
    <Section
      title="Execution history"
      description="Runs triggered by this schedule, including retries and Run now. Open a run for stage details and logs."
      action={<SimulatedBadge reason="Run history in demo mode is seeded or simulated by the in-browser mock API." />}
    >
      <TableToolbar className="mb-0">
        <FilterSelect
          label="Statuses"
          value={status}
          onChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
          options={STATUS_OPTIONS}
        />
        {runs.data && !runs.isLoading ? (
          <span className="text-xs text-muted-foreground">
            {runs.data.total} {runs.data.total === 1 ? 'run' : 'runs'}
          </span>
        ) : null}
      </TableToolbar>
      <div className="overflow-x-auto">{body()}</div>
    </Section>
  )
}
