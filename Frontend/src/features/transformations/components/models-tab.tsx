import { Boxes, FilterX, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { LayerBadge, RunStatusBadge } from '@/components/status/status-badge'
import { DataTable, FilterSelect, SearchInput, TableToolbar, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { wsPath } from '@/hooks/use-workspace'
import type { RunStatus, TransformationSummary, TransformationType } from '@/types'
import { RUN_STATUS_OPTIONS, TYPE_OPTIONS } from '../lib/labels'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { useTransformations } from '../queries'
import { TestSummaryCell } from './test-summary'

const TYPE_RANK: Record<TransformationType, number> = { staging: 0, intermediate: 1, silver: 2, gold: 3 }

function columnsFor(workspaceId: string): Column<TransformationSummary>[] {
  return [
    {
      id: 'name',
      header: 'Model',
      sortValue: (t) => t.name,
      cell: (t) => (
        <div className="min-w-0">
          <Link
            to={wsPath(workspaceId, 'transformations', t.id)}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-[13px] font-medium hover:underline"
          >
            {t.name}
          </Link>
          <p className="max-w-xs truncate text-xs text-muted-foreground">{t.description}</p>
        </div>
      ),
    },
    { id: 'type', header: 'Type', sortValue: (t) => TYPE_RANK[t.type], cell: (t) => <LayerBadge layer={t.type} /> },
    {
      id: 'materialization',
      header: 'Materialization',
      sortValue: (t) => t.materialization,
      hideOnMobile: true,
      cell: (t) => <span className="text-sm text-muted-foreground">{t.materialization}</span>,
    },
    {
      id: 'schema',
      header: 'Schema',
      sortValue: (t) => t.schema,
      hideOnMobile: true,
      cell: (t) => <span className="font-mono text-xs text-muted-foreground">{t.schema}</span>,
    },
    {
      id: 'tags',
      header: 'Tags',
      hideOnMobile: true,
      cell: (t) =>
        t.tags.length ? (
          <div className="flex max-w-48 flex-wrap gap-1">
            {t.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="font-normal">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-subtle-foreground">None</span>
        ),
    },
    {
      id: 'last_run',
      header: 'Last run',
      sortValue: (t) => t.last_run_at,
      cell: (t) => (
        <div className="flex flex-col items-start gap-0.5">
          <RunStatusBadge status={t.last_run_status} />
          {t.last_run_at ? <TimeAgo value={t.last_run_at} className="text-xs text-muted-foreground" /> : null}
        </div>
      ),
    },
    {
      id: 'tests',
      header: 'Tests',
      sortValue: (t) => t.tests.failed * 1000 + t.tests.warned,
      hideOnMobile: true,
      cell: (t) => <TestSummaryCell tests={t.tests} />,
    },
    {
      id: 'owner',
      header: 'Owner',
      sortValue: (t) => t.owner,
      hideOnMobile: true,
      cell: (t) => <span className="text-sm whitespace-nowrap text-muted-foreground">{t.owner}</span>,
    },
  ]
}

export function ModelsTab({ workspaceId, allTags }: { workspaceId: string; allTags: string[] }) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [status, setStatus] = useState('all')
  const [tag, setTag] = useState('all')
  const q = useDebouncedValue(search.trim())

  const filtered = Boolean(q || type !== 'all' || status !== 'all' || tag !== 'all')
  const query = useTransformations(workspaceId, {
    q: q || undefined,
    type: type === 'all' ? undefined : (type as TransformationType),
    status: status === 'all' ? undefined : (status as RunStatus),
    tag: tag === 'all' ? undefined : tag,
  })
  const columns = useMemo(() => columnsFor(workspaceId), [workspaceId])

  const clearFilters = () => {
    setSearch('')
    setType('all')
    setStatus('all')
    setTag('all')
  }

  return (
    <div>
      <TableToolbar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search models, tags, owners" />
        <FilterSelect label="Types" value={type} onChange={setType} options={TYPE_OPTIONS} />
        <FilterSelect label="Run statuses" value={status} onChange={setStatus} options={RUN_STATUS_OPTIONS} />
        <FilterSelect label="Tags" value={tag} onChange={setTag} options={allTags.map((t) => ({ value: t, label: t }))} />
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <FilterX className="size-3.5" aria-hidden />
            Clear filters
          </Button>
        ) : null}
        {query.data ? (
          <span className="text-xs text-muted-foreground sm:ml-auto" aria-live="polite">
            {query.data.length} {query.data.length === 1 ? 'model' : 'models'}
          </span>
        ) : null}
      </TableToolbar>

      {query.isPending ? (
        <TableSkeleton rows={8} columns={6} />
      ) : query.isError ? (
        <ErrorState error={query.error} title="Could not load dbt models" onRetry={() => query.refetch()} />
      ) : (
        <DataTable
          caption="dbt models"
          columns={columns}
          rows={query.data}
          getRowId={(t) => t.id}
          onRowClick={(t) => navigate(wsPath(workspaceId, 'transformations', t.id))}
          pageSize={15}
          className={query.isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}
          empty={
            filtered ? (
              <EmptyState
                icon={FilterX}
                title="No models match these filters"
                description="Try a different search term or clear the filters."
                action={
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Boxes}
                title="No dbt models yet"
                description="The connected dbt project has no models. Use AI-assisted mapping to propose staging and fact or dimension models, or add models to the repository."
                action={
                  <Button asChild size="sm">
                    <Link to={wsPath(workspaceId, 'transformations', 'mapping')}>
                      <Sparkles className="size-3.5" aria-hidden />
                      Open AI mapping
                    </Link>
                  </Button>
                }
              />
            )
          }
        />
      )}
    </div>
  )
}
