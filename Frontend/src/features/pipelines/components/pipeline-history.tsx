import { History } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { FilterSelect } from '@/components/tables/data-table'
import type { RunStatus } from '@/types'
import { usePipelineRuns } from '../queries'
import { RUN_STATUS_OPTIONS } from './recent-executions'
import { RunsTable } from './runs-table'

const PAGE_SIZE = 10

export function PipelineHistory({ pipelineId, workspaceId }: { pipelineId: string; workspaceId: string }) {
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const runs = usePipelineRuns(pipelineId, { status: status === 'all' ? undefined : (status as RunStatus), page, page_size: PAGE_SIZE })

  return (
    <Section
      title="Execution history"
      description="Every run of this pipeline, newest first. Open a run for its stages, logs and errors."
      action={
        <FilterSelect
          label="Statuses"
          value={status}
          onChange={(v) => {
            setStatus(v)
            setPage(1)
          }}
          options={RUN_STATUS_OPTIONS}
        />
      }
    >
      {runs.isPending ? (
        <TableSkeleton rows={5} columns={6} />
      ) : runs.error ? (
        <ErrorState error={runs.error} title="Could not load execution history" onRetry={() => void runs.refetch()} />
      ) : !runs.data.items.length ? (
        <EmptyState
          compact
          icon={History}
          title={status === 'all' ? 'This pipeline has not run yet' : 'No runs with this status'}
          description={status === 'all' ? 'Use Run now above to start the first run, or attach a schedule.' : 'Choose another status to see more runs.'}
        />
      ) : (
        <RunsTable
          runs={runs.data.items}
          workspaceId={workspaceId}
          caption="Pipeline execution history"
          pagination={{ page: runs.data.page, pageSize: runs.data.page_size, total: runs.data.total, onPageChange: setPage }}
        />
      )}
    </Section>
  )
}
