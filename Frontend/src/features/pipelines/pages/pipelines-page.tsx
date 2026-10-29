import { Database, Plus, Workflow } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader, Section } from '@/components/layout/page-header'
import { DisabledReason } from '@/components/runs/disabled-reason'
import { FilterSelect, SearchInput, TableToolbar } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import type { PipelineListQuery, PipelineStatus, RunStatus } from '@/types'
import { FlowExplainer } from '../components/flow-explainer'
import { PipelinesTable } from '../components/pipelines-table'
import { RecentExecutions, RUN_STATUS_OPTIONS } from '../components/recent-executions'
import { PIPELINE_STATUS_LABELS } from '../lib/pipeline-state'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { usePipelines, useWorkspaceSources } from '../queries'

const STATUS_OPTIONS = (Object.keys(PIPELINE_STATUS_LABELS) as PipelineStatus[]).map((value) => ({ value, label: PIPELINE_STATUS_LABELS[value] }))

function CreatePipelineButton({ workspaceId, size = 'default' }: { workspaceId: string; size?: 'default' | 'sm' }) {
  const canWrite = usePermission('pipelines:write')
  if (!canWrite) {
    return (
      <DisabledReason reason='Creating pipelines requires the "pipelines:write" permission (admin or owner).'>
        <Button size={size} disabled>
          <Plus aria-hidden />
          Create pipeline
        </Button>
      </DisabledReason>
    )
  }
  return (
    <Button size={size} asChild>
      <Link to={wsPath(workspaceId, 'pipelines', 'new')}>
        <Plus aria-hidden />
        Create pipeline
      </Link>
    </Button>
  )
}

export default function PipelinesPage() {
  const { workspaceId } = useWorkspace()
  // Keyed so search, filters and paging reset when switching workspaces.
  return <PipelinesView key={workspaceId} workspaceId={workspaceId} />
}

function PipelinesView({ workspaceId }: { workspaceId: string }) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [lastRun, setLastRun] = useState('all')
  const [source, setSource] = useState('all')
  const q = useDebouncedValue(search.trim())

  const query: PipelineListQuery = {
    q: q || undefined,
    status: status === 'all' ? undefined : (status as PipelineStatus),
    last_run_status: lastRun === 'all' ? undefined : (lastRun as RunStatus),
    source_id: source === 'all' ? undefined : source,
  }
  const filtered = Boolean(query.q || query.status || query.last_run_status || query.source_id)
  const pipelines = usePipelines(workspaceId, query)
  const sources = useWorkspaceSources(workspaceId)
  const noSources = sources.isSuccess && sources.data.length === 0

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setLastRun('all')
    setSource('all')
  }

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Pipelines & Sync Jobs"
          description="End-to-end jobs that ingest from your sources into Bronze, build Silver and Gold models with dbt, check quality and refresh Metabase."
          actions={<CreatePipelineButton workspaceId={workspaceId} />}
        />
        <FlowExplainer />
      </div>

      <Section title="Pipelines" description="Click a pipeline for its configuration, live progress and execution history.">
        <TableToolbar className="mb-0">
          <SearchInput value={search} onChange={setSearch} placeholder="Search pipelines" />
          <FilterSelect label="Statuses" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          <FilterSelect label="Last run results" value={lastRun} onChange={setLastRun} options={RUN_STATUS_OPTIONS} />
          <FilterSelect label="Sources" value={source} onChange={setSource} options={(sources.data ?? []).map((s) => ({ value: s.id, label: s.name }))} />
          {filtered ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </TableToolbar>

        {pipelines.isPending ? (
          <TableSkeleton rows={5} columns={7} />
        ) : pipelines.error ? (
          <ErrorState error={pipelines.error} title="Could not load pipelines" onRetry={() => void pipelines.refetch()} />
        ) : !pipelines.data.length && filtered ? (
          <EmptyState
            compact
            icon={Workflow}
            title="No pipelines match these filters"
            description="Try a different search term or clear the filters."
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <PipelinesTable
            pipelines={pipelines.data}
            sources={sources.data}
            workspaceId={workspaceId}
            empty={
              noSources ? (
                <EmptyState
                  icon={Database}
                  title="Connect a source to build your first pipeline"
                  description="Pipelines start from a connected source such as Salesforce or a PostgreSQL database. Once a source is connected you can chain ingestion, dbt models, quality checks and the Metabase refresh."
                  action={
                    <Button asChild>
                      <Link to={wsPath(workspaceId, 'sources', 'new')}>
                        <Plus aria-hidden />
                        Connect a source
                      </Link>
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={Workflow}
                  title="No pipelines yet"
                  description="A pipeline keeps your dashboards current: it syncs the selected sources, runs your dbt models, checks data quality and refreshes Metabase in one tracked run."
                  action={<CreatePipelineButton workspaceId={workspaceId} />}
                />
              )
            }
          />
        )}
      </Section>

      <RecentExecutions workspaceId={workspaceId} />
    </div>
  )
}
