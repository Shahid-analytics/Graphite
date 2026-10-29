import { History } from 'lucide-react'
import { useState } from 'react'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { SimulatedBadge } from '@/components/status/simulated'
import { TableToolbar } from '@/components/tables/data-table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { RunKind } from '@/types'
import { useTransformationRuns } from '../queries'
import { DbtRunsTable } from './dbt-runs-table'

const PAGE_SIZE = 10

export function ModelRunsTab({ workspaceId, transformationId }: { workspaceId: string; transformationId: string }) {
  const [kind, setKind] = useState<'all' | RunKind>('all')
  const [page, setPage] = useState(1)
  const query = useTransformationRuns(transformationId, { kind: kind === 'all' ? undefined : kind, page, page_size: PAGE_SIZE })

  return (
    <div>
      <TableToolbar>
        <ToggleGroup
          type="single"
          size="sm"
          value={kind}
          onValueChange={(value) => {
            if (!value) return
            setKind(value as 'all' | RunKind)
            setPage(1)
          }}
          aria-label="Command"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="transformation">dbt run</ToggleGroupItem>
          <ToggleGroupItem value="dbt_test">dbt test</ToggleGroupItem>
        </ToggleGroup>
        <SimulatedBadge className="sm:ml-auto" reason="Run history in demo mode comes from the in-browser mock API. No dbt command was executed." />
      </TableToolbar>
      {query.isPending ? (
        <TableSkeleton rows={5} columns={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} title="Could not load runs for this model" onRetry={() => query.refetch()} />
      ) : (
        <DbtRunsTable
          workspaceId={workspaceId}
          data={query.data}
          page={page}
          onPageChange={setPage}
          dimmed={query.isPlaceholderData}
          empty={
            <EmptyState
              icon={History}
              title="No runs for this model yet"
              description="Use Run model or Run tests above. Runs started by pipelines that build this model are listed under each pipeline."
              compact
            />
          }
        />
      )}
    </div>
  )
}
