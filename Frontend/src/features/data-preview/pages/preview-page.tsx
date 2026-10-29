import { ArrowRight, DatabaseZap, Plug, Table2, TableProperties } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { LayerBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatCompact } from '@/lib/format'
import type { DataModel } from '@/types'
import { ModelPicker } from '../components/model-picker'
import { PreviewPanel } from '../components/preview-panel'
import { usePreviewModels } from '../queries'

const QUICK_PICK_LIMIT = 6

/** Gold facts and dimensions first (largest first), then other Gold and Silver tables to fill the list. */
function quickPicks(models: DataModel[]) {
  const score = (m: DataModel) => (m.layer === 'gold' ? 0 : m.layer === 'silver' ? 2 : 4) + (m.role === 'fact' || m.role === 'dimension' ? 0 : 1)
  return [...models]
    .filter((m) => m.layer !== 'bronze')
    .sort((a, b) => score(a) - score(b) || (b.row_count ?? 0) - (a.row_count ?? 0) || a.name.localeCompare(b.name))
    .slice(0, QUICK_PICK_LIMIT)
}

function QuickPicks({ models, onPick }: { models: DataModel[]; onPick: (model: DataModel) => void }) {
  return (
    <ul className="mt-1 grid w-full max-w-2xl gap-2 text-left sm:grid-cols-2">
      {models.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            onClick={() => onPick(m)}
            className="group flex w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-left shadow-xs transition-colors hover:border-border-strong hover:bg-surface focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none"
          >
            <TableProperties className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[13px]">
                {m.schema}.{m.name}
              </span>
              <span className="block text-xs text-muted-foreground">
                {m.role} · <span className="tabular">{formatCompact(m.row_count)}</span> rows
              </span>
            </span>
            <LayerBadge layer={m.layer} />
            <ArrowRight className="size-3.5 shrink-0 text-subtle-foreground group-hover:text-foreground" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  )
}

export default function PreviewPage() {
  const { workspaceId } = useWorkspace()
  const canAddSource = usePermission('sources:write')
  const [params, setParams] = useSearchParams()
  const models = usePreviewModels(workspaceId)
  const modelId = params.get('model')
  const list = useMemo(() => models.data ?? [], [models.data])
  const selected = modelId ? (list.find((m) => m.id === modelId) ?? null) : null
  const picks = useMemo(() => quickPicks(list), [list])

  const selectModel = (id: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (id) next.set('model', id)
        else next.delete('model')
        return next
      },
      { replace: false },
    )

  const header = (
    <PageHeader
      title="Data Preview"
      description={
        <span className="inline-flex flex-wrap items-center gap-1">
          Browse sample rows from Bronze, Silver and Gold tables to check what the pipeline produced.
          <HelpTip label="About layers">
            Bronze holds raw copies of source tables loaded by ingestion. Silver holds cleaned, conformed tables built by dbt. Gold holds facts, dimensions
            and aggregates used by dashboards.
          </HelpTip>
        </span>
      }
    />
  )

  if (models.isLoading) {
    return (
      <div>
        {header}
        <div className="space-y-4" aria-busy="true" aria-label="Loading tables">
          <Skeleton className="h-9 w-full sm:w-[26rem]" />
          <TableSkeleton rows={6} columns={5} />
        </div>
      </div>
    )
  }

  if (models.error) {
    return (
      <div>
        {header}
        <ErrorState error={models.error} title="Could not load the table catalog" onRetry={() => void models.refetch()} />
      </div>
    )
  }

  if (!list.length) {
    const addSource = canAddSource ? (
      <Button asChild size="sm">
        <Link to={wsPath(workspaceId, 'sources', 'new')}>
          <Plug aria-hidden />
          Add a data source
        </Link>
      </Button>
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0}>
            <Button size="sm" disabled>
              <Plug aria-hidden />
              Add a data source
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">Adding sources requires the "sources:write" permission. Ask a workspace admin or editor.</TooltipContent>
      </Tooltip>
    )
    return (
      <div>
        {header}
        <EmptyState
          icon={DatabaseZap}
          title="No tables to preview yet"
          description="Tables appear here once a source has been ingested into Bronze and dbt has built Silver and Gold models. Connect a source to get started."
          action={addSource}
        />
      </div>
    )
  }

  return (
    <div>
      {header}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <ModelPicker models={list} selectedId={selected?.id ?? null} onSelect={(m) => selectModel(m.id)} />
        <p className="text-xs text-muted-foreground">
          {list.length} table{list.length === 1 ? '' : 's'} across {new Set(list.map((m) => m.schema)).size} schema
          {new Set(list.map((m) => m.schema)).size === 1 ? '' : 's'}
        </p>
      </div>

      {modelId && !selected ? (
        <Notice
          tone="warning"
          title="Table not found"
          action={
            <Button variant="outline" size="sm" onClick={() => selectModel(null)}>
              Clear selection
            </Button>
          }
        >
          The table in this link ({modelId}) is not in this workspace's catalog. It may have been removed, or the link points to another workspace.
        </Notice>
      ) : selected ? (
        <PreviewPanel key={selected.id} model={selected} workspaceId={workspaceId} />
      ) : (
        <EmptyState
          icon={Table2}
          title="Select a table to preview"
          description={
            picks.length
              ? 'Use the table picker above, or start with one of these Gold facts and dimensions.'
              : 'Use the table picker above to choose a Bronze table. No Silver or Gold models have been built yet.'
          }
          action={picks.length ? <QuickPicks models={picks} onPick={(m) => selectModel(m.id)} /> : undefined}
        />
      )}
    </div>
  )
}
