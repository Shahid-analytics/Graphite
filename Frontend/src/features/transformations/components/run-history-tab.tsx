import { History } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { SimulatedBadge } from '@/components/status/simulated'
import { FilterSelect, TableToolbar } from '@/components/tables/data-table'
import type { RunKind, RunStatus } from '@/types'
import { RUN_STATUS_OPTIONS } from '../lib/labels'
import { useWorkspaceDbtRuns } from '../queries'
import { DbtRunsTable } from './dbt-runs-table'

const PAGE_SIZE = 15

/** Both dbt commands; the API accepts a comma-separated kind list and returns them newest first. */
const DBT_KINDS: RunKind[] = ['transformation', 'dbt_test']

const COMMAND_OPTIONS: { value: RunKind; label: string }[] = [
  { value: 'transformation', label: 'dbt run' },
  { value: 'dbt_test', label: 'dbt test' },
]

/** Workspace-wide history of dbt runs and dbt tests in one list, filterable by command and status. */
export function RunHistoryTab({ workspaceId }: { workspaceId: string }) {
  const [kind, setKind] = useState('all')
  const [status, setStatus] = useState('all')
  const [page, setPage] = useState(1)
  const query = useWorkspaceDbtRuns(workspaceId, {
    kind: kind === 'all' ? DBT_KINDS : (kind as RunKind),
    status: status === 'all' ? undefined : (status as RunStatus),
    page,
    page_size: PAGE_SIZE,
  })
  const filtered = kind !== 'all' || status !== 'all'
  const noun = kind === 'dbt_test' ? 'dbt test' : kind === 'transformation' ? 'dbt run' : 'dbt run or test'

  return (
    <div>
      <TableToolbar>
        <FilterSelect
          label="Commands"
          value={kind}
          onChange={(value) => {
            setKind(value)
            setPage(1)
          }}
          options={COMMAND_OPTIONS}
        />
        <FilterSelect
          label="Statuses"
          value={status}
          onChange={(value) => {
            setStatus(value)
            setPage(1)
          }}
          options={RUN_STATUS_OPTIONS}
        />
        <SimulatedBadge className="sm:ml-auto" reason="Run history in demo mode comes from the in-browser mock API. No dbt command was executed." />
      </TableToolbar>
      {query.isPending ? (
        <TableSkeleton rows={8} columns={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} title="Could not load run history" onRetry={() => query.refetch()} />
      ) : (
        <DbtRunsTable
          workspaceId={workspaceId}
          data={query.data}
          page={page}
          onPageChange={setPage}
          showModel
          dimmed={query.isPlaceholderData}
          empty={
            <EmptyState
              icon={History}
              title={filtered ? `No ${noun} matches these filters` : 'No dbt run history yet'}
              description={
                filtered
                  ? 'Choose a different command or status to see other runs.'
                  : 'Open a model and use Run model or Run tests. Pipeline runs that include dbt appear under Pipelines.'
              }
            />
          }
        />
      )}
    </div>
  )
}
