import { History } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { FilterSelect, TableToolbar } from '@/components/tables/data-table'
import type { RunKind, RunListQuery, RunStatus } from '@/types'
import { useWorkspaceRuns } from '../queries'
import { RunsTable } from './runs-table'

const PAGE_SIZE = 10

const KIND_OPTIONS: { value: RunKind; label: string }[] = [
  { value: 'pipeline', label: 'Pipeline runs' },
  { value: 'ingestion', label: 'Source syncs' },
  { value: 'transformation', label: 'dbt runs' },
  { value: 'dbt_test', label: 'dbt tests' },
]

export const RUN_STATUS_OPTIONS: { value: RunStatus; label: string }[] = [
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'succeeded', label: 'Succeeded' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
]

/** Latest executions of every kind across the workspace. */
export function RecentExecutions({ workspaceId }: { workspaceId: string }) {
  const [kind, setKind] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const query: RunListQuery = {
    kind: kind === 'all' ? undefined : (kind as RunKind),
    status: status === 'all' ? undefined : (status as RunStatus),
    page,
    page_size: PAGE_SIZE,
  }
  const runs = useWorkspaceRuns(workspaceId, query)
  const filtered = kind !== 'all' || status !== 'all'

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          Recent executions
          <SimulatedBadge />
        </span>
      }
      description="Every pipeline run, source sync and dbt job in this workspace, newest first."
    >
      <TableToolbar className="mb-0">
        <FilterSelect
          label="Kinds"
          value={kind}
          onChange={(v) => {
            setKind(v)
            setPage(1)
          }}
          options={KIND_OPTIONS}
        />
        <FilterSelect
          label="Statuses"
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          options={RUN_STATUS_OPTIONS}
        />
      </TableToolbar>
      {runs.isPending ? (
        <TableSkeleton rows={5} columns={6} />
      ) : runs.error ? (
        <ErrorState error={runs.error} title="Could not load recent executions" onRetry={() => void runs.refetch()} />
      ) : !runs.data.items.length ? (
        <EmptyState
          compact
          icon={History}
          title={filtered ? 'No executions match these filters' : 'No executions yet'}
          description={filtered ? 'Try another kind or status.' : 'Runs appear here once a pipeline, source sync or dbt job has been triggered.'}
        />
      ) : (
        <RunsTable
          runs={runs.data.items}
          workspaceId={workspaceId}
          showTarget
          caption="Recent executions"
          pagination={{ page: runs.data.page, pageSize: runs.data.page_size, total: runs.data.total, onPageChange: setPage }}
        />
      )}
    </Section>
  )
}
