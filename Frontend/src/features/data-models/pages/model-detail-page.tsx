import { Code2, Database, ExternalLink, Plug } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router'
import { HelpTip, StatTile } from '@/components/data/display'
import { CardsSkeleton, EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { FreshnessBadge, LayerBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatBytes, formatCompact, formatNumber } from '@/lib/format'
import { isApiError } from '@/services/api-error'
import type { DataModel } from '@/types'
import { ColumnsTab } from '../components/detail/columns-tab'
import { DetailsTab } from '../components/detail/details-tab'
import { LineageTab } from '../components/detail/lineage-tab'
import { ModelNotices } from '../components/detail/model-notices'
import { PreviewTab } from '../components/detail/preview-tab'
import { QualityTab } from '../components/detail/quality-tab'
import { RelationshipsTab } from '../components/detail/relationships-tab'
import { formatSla, MATERIALIZATION_LABEL, ROLE_LABEL } from '../lib/labels'
import { useModel } from '../queries'

const TABS = ['columns', 'quality', 'lineage', 'relationships', 'preview', 'details'] as const
type TabKey = (typeof TABS)[number]

export default function ModelDetailPage() {
  const { modelId = '' } = useParams()
  const { workspaceId } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const query = useModel(modelId)

  const requested = params.get('tab')
  const tab: TabKey = TABS.includes(requested as TabKey) ? (requested as TabKey) : 'columns'
  const setTab = (next: string) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'columns') p.delete('tab')
        else p.set('tab', next)
        return p
      },
      { replace: true },
    )

  const catalog = wsPath(workspaceId, 'models')
  const baseCrumbs = [{ label: 'Data models', to: catalog }]

  if (query.isPending) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading model">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-6 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <CardsSkeleton count={6} className="sm:grid-cols-3 xl:grid-cols-6" />
        <TableSkeleton rows={8} columns={6} />
      </div>
    )
  }

  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.status === 404
    return (
      <>
        <PageHeader title={notFound ? 'Model not found' : 'Data model'} breadcrumbs={[...baseCrumbs, { label: modelId }]} />
        {notFound ? (
          <EmptyState
            icon={Database}
            title="This model does not exist"
            description="It may have been dropped from the warehouse or the link is out of date."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to={catalog}>Back to data models</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={query.error} title="Could not load this model" onRetry={() => query.refetch()} />
        )}
      </>
    )
  }

  const model = query.data
  if (model.workspace_id !== workspaceId) {
    return (
      <>
        <PageHeader title="Model not in this workspace" breadcrumbs={[...baseCrumbs, { label: modelId }]} />
        <EmptyState
          icon={Database}
          title="This model belongs to another workspace"
          description="Switch to the workspace that owns it to view its details."
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to={catalog}>Back to data models</Link>
            </Button>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[...baseCrumbs, { label: model.schema, to: `${catalog}?schema=${encodeURIComponent(model.schema)}` }, { label: model.name }]}
        title={<span className="font-mono">{model.name}</span>}
        meta={
          <>
            <LayerBadge layer={model.layer} />
            <Badge variant="outline">{ROLE_LABEL[model.role]}</Badge>
            <Badge variant="default">{MATERIALIZATION_LABEL[model.materialization]}</Badge>
            <FreshnessBadge status={model.freshness_status} />
          </>
        }
        description={
          <>
            <span className="font-mono text-xs">
              {model.database}.{model.schema}.{model.name}
            </span>
            {model.description ? <span className="mt-1 block">{model.description}</span> : null}
          </>
        }
        actions={<HeaderActions model={model} workspaceId={workspaceId} />}
      />

      <div className="space-y-6">
        <ModelNotices model={model} workspaceId={workspaceId} onShowQuality={() => setTab('quality')} />
        <ModelStats model={model} />
        {/* Keyed by model so tab-local state (column search, lineage depth, filters) resets when following a link to another model. */}
        <Tabs key={model.id} value={tab} onValueChange={setTab}>
          <TabsList aria-label="Model sections">
            <TabsTrigger value="columns">
              Columns <span className="text-xs text-subtle-foreground tabular">{model.columns_count}</span>
            </TabsTrigger>
            <TabsTrigger value="quality">
              Quality
              {model.quality.failed ? <Badge variant="danger">{model.quality.failed}</Badge> : model.quality.warned ? <Badge variant="warning">{model.quality.warned}</Badge> : null}
            </TabsTrigger>
            <TabsTrigger value="lineage">Lineage</TabsTrigger>
            <TabsTrigger value="relationships">Relationships</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
          </TabsList>
          <TabsContent value="columns">
            <ColumnsTab modelId={model.id} workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="quality">
            <QualityTab model={model} workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="lineage">
            <LineageTab model={model} workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="relationships">
            <RelationshipsTab model={model} workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="preview">
            <PreviewTab model={model} workspaceId={workspaceId} />
          </TabsContent>
          <TabsContent value="details">
            <DetailsTab model={model} workspaceId={workspaceId} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}

function HeaderActions({ model, workspaceId }: { model: DataModel; workspaceId: string }) {
  return (
    <>
      {model.transformation_id ? (
        <Button variant="outline" size="sm" asChild>
          <Link to={wsPath(workspaceId, 'transformations', model.transformation_id)}>
            <Code2 aria-hidden />
            Transformation
          </Link>
        </Button>
      ) : null}
      {model.source_id ? (
        <Button variant="outline" size="sm" asChild>
          <Link to={wsPath(workspaceId, 'sources', model.source_id)}>
            <Plug aria-hidden />
            Source
          </Link>
        </Button>
      ) : null}
      <Button variant="outline" size="sm" asChild>
        <Link to={`${wsPath(workspaceId, 'preview')}?model=${encodeURIComponent(model.id)}`}>
          <ExternalLink aria-hidden />
          Data preview
        </Link>
      </Button>
    </>
  )
}

function ModelStats({ model }: { model: DataModel }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      <StatTile label="Rows" value={formatCompact(model.row_count)} hint={model.row_count !== null ? `${formatNumber(model.row_count)} rows` : 'Not counted yet'} />
      <StatTile label="Size" value={formatBytes(model.size_bytes)} hint="Estimated by the warehouse" />
      <StatTile label="Columns" value={formatNumber(model.columns_count)} hint={model.primary_key.length ? `Key: ${model.primary_key.join(', ')}` : 'No primary key'} />
      <StatTile
        label={
          <span className="inline-flex items-center gap-1">
            Freshness SLA
            <HelpTip label="About freshness SLA">The maximum time allowed between refreshes. A table refreshed less recently than this is marked stale.</HelpTip>
          </span>
        }
        value={formatSla(model.freshness_sla_minutes)}
        hint={model.freshness_status === 'stale' ? 'Currently breached' : model.freshness_status === 'fresh' ? 'Within SLA' : 'No SLA configured'}
        tone={model.freshness_status === 'stale' ? 'warning' : undefined}
      />
      <StatTile
        label="Null-issue columns"
        value={formatNumber(model.null_issue_columns)}
        hint="More than 5% nulls"
        tone={model.null_issue_columns ? 'warning' : undefined}
      />
      <StatTile
        label="Duplicate rows"
        value={formatNumber(model.duplicate_rows)}
        hint={model.primary_key.length ? `On ${model.primary_key.join(', ')}` : 'No key to test'}
        tone={model.duplicate_rows ? 'danger' : undefined}
      />
    </div>
  )
}
