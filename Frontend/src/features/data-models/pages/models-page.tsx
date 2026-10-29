import { Database, FileStack, Plug, TableProperties } from 'lucide-react'
import { Link } from 'react-router'
import { CardsSkeleton, EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { CatalogFilters } from '../components/catalog-filters'
import { CatalogSummary, SchemaDriftNotice } from '../components/catalog-summary'
import { CatalogTree } from '../components/catalog-tree'
import { PermissionButton } from '../components/permission-button'
import { ModelsTable } from '../components/models-table'
import { useModelFilters } from '../lib/use-model-filters'
import { useModels, useQualitySummary } from '../queries'

const DESCRIPTION = 'Catalog of warehouse tables across the Bronze, Silver and Gold layers, with freshness, quality checks and schema drift.'

export default function ModelsPage() {
  const { workspaceId } = useWorkspace()
  const canAddSource = usePermission('sources:write')
  const filters = useModelFilters()
  const all = useModels(workspaceId)
  const filtered = useModels(workspaceId, filters.query)
  const summary = useQualitySummary(workspaceId)

  const actions = (
    <>
      <Button variant="outline" size="sm" asChild>
        <Link to={wsPath(workspaceId, 'models', 'proposals')}>
          <FileStack aria-hidden />
          Schema proposals
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <Link to={wsPath(workspaceId, 'preview')}>
          <TableProperties aria-hidden />
          Data preview
        </Link>
      </Button>
    </>
  )
  const header = <PageHeader title="Data models" description={DESCRIPTION} actions={actions} />

  if (all.isPending) {
    return (
      <>
        {header}
        <div className="space-y-4">
          <CardsSkeleton count={5} className="sm:grid-cols-3 xl:grid-cols-5" />
          <TableSkeleton rows={8} columns={6} />
        </div>
      </>
    )
  }
  if (all.isError) {
    return (
      <>
        {header}
        <ErrorState error={all.error} title="Could not load data models" onRetry={() => all.refetch()} />
      </>
    )
  }

  const models = all.data
  if (!models.length) {
    return (
      <>
        {header}
        <EmptyState
          icon={Database}
          title="No data models yet"
          description="Tables appear here once a source has been ingested into Bronze and dbt transformations have built the Silver and Gold layers."
          action={
            <>
              {canAddSource ? (
                <Button size="sm" asChild>
                  <Link to={wsPath(workspaceId, 'sources', 'new')}>
                    <Plug aria-hidden />
                    Connect a source
                  </Link>
                </Button>
              ) : (
                <PermissionButton size="sm" allowed={false} reason="Connecting a source requires the sources:write permission. Ask a workspace admin.">
                  <Plug aria-hidden />
                  Connect a source
                </PermissionButton>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to={wsPath(workspaceId, 'onboarding')}>Open setup guide</Link>
              </Button>
            </>
          }
        />
      </>
    )
  }

  return (
    <>
      {header}
      <div className="space-y-4">
        <CatalogSummary models={models} summary={summary.data} summaryError={summary.isError ? summary.error : null} onRetrySummary={() => summary.refetch()} />
        <SchemaDriftNotice
          models={models}
          workspaceId={workspaceId}
          filtered={Boolean(filters.query.has_schema_changes)}
          onShowAffected={() => filters.setFilter('changes', '1')}
        />
        <div className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-4">
              <CatalogTree models={models} workspaceId={workspaceId} selectedSchema={filters.query.schema} onSelectSchema={(schema) => filters.setFilter('schema', schema)} />
            </div>
          </aside>
          <div className="min-w-0 space-y-3">
            <CatalogFilters filters={filters} allModels={models} />
            <div aria-live="polite" className="sr-only">
              {filtered.data ? `${filtered.data.length} model${filtered.data.length === 1 ? '' : 's'} shown` : ''}
            </div>
            {filtered.isError ? (
              <ErrorState error={filtered.error} title="Could not apply these filters" onRetry={() => filtered.refetch()} />
            ) : !filtered.data ? (
              <TableSkeleton columns={6} />
            ) : (
              <div className={filtered.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
                <ModelsTable models={filtered.data} workspaceId={workspaceId} onClearFilters={filters.clear} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
