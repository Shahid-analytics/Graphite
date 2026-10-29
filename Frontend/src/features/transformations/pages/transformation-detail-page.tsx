import { FlaskConical, GitBranch, Play } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { CopyButton, TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { LayerBadge, RunStatusBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import { isTerminal, type RunKind } from '@/types'
import { ActiveRunPanel } from '../components/active-run-panel'
import { ColumnsTab } from '../components/columns-tab'
import { DetailsTab } from '../components/details-tab'
import { GatedButton, PERMISSION_REASONS } from '../components/gated-button'
import { ModelLineageTab } from '../components/model-lineage-tab'
import { ModelRunsTab } from '../components/model-runs-tab'
import { PreviewTab } from '../components/preview-tab'
import { RunModelDialog } from '../components/run-model-dialog'
import { SqlTab } from '../components/sql-tab'
import { TestsTab } from '../components/tests-tab'
import { useTabParam } from '../lib/use-tab-param'
import { useDbtProject, useTestTransformation, useTransformation, useTransformationRuns, useTransformations } from '../queries'

const TABS = ['sql', 'columns', 'lineage', 'tests', 'runs', 'preview', 'details'] as const

/** First page of this model's runs; shared with the Runs tab default view. */
const RECENT_RUNS_QUERY = { page: 1, page_size: 10 }

export default function TransformationDetailPage() {
  const { transformationId = '' } = useParams()
  // Remount per model so live-run panels, dialogs and editor state never carry over between models.
  return <TransformationDetail key={transformationId} transformationId={transformationId} />
}

function TransformationDetail({ transformationId }: { transformationId: string }) {
  const { workspaceId } = useWorkspace()
  const canRun = usePermission('transformations:run')
  const [tab, setTab] = useTabParam(TABS, 'sql')
  const [runDialogOpen, setRunDialogOpen] = useState(false)
  const [triggered, setTriggered] = useState<Partial<Record<RunKind, string>>>({})
  const [dismissed, setDismissed] = useState<string[]>([])

  const query = useTransformation(transformationId)
  const project = useDbtProject(workspaceId)
  const recentRuns = useTransformationRuns(transformationId, RECENT_RUNS_QUERY)
  const all = useTransformations(workspaceId)
  const testMutation = useTestTransformation(transformationId)

  const transformationByModel = useMemo(
    () => new Map((all.data ?? []).filter((t) => t.output_model_id).map((t) => [t.output_model_id!, t.id])),
    [all.data],
  )

  // Runs to follow live: those started here, plus any already in flight when the page opened.
  const liveRunIds = useMemo(() => {
    const ids: string[] = []
    for (const kind of ['transformation', 'dbt_test'] as const) {
      const id = triggered[kind] ?? recentRuns.data?.items.find((r) => r.kind === kind && !isTerminal(r.status))?.id
      if (id && !dismissed.includes(id)) ids.push(id)
    }
    return ids
  }, [triggered, recentRuns.data, dismissed])

  const activeOf = (kind: RunKind) => recentRuns.data?.items.some((r) => r.kind === kind && !isTerminal(r.status)) ?? false
  const runActive = activeOf('transformation')
  const testActive = activeOf('dbt_test')

  const listPath = wsPath(workspaceId, 'transformations')
  const t = query.data

  if (query.isPending) {
    return (
      <div>
        <PageHeader title={<span className="sr-only">Loading model</span>} breadcrumbs={[{ label: 'Transformations', to: listPath }, { label: 'Loading' }]} />
        <div className="space-y-4" aria-busy="true" aria-label="Loading model">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-9 w-full max-w-xl" />
          <TableSkeleton rows={10} columns={1} />
        </div>
      </div>
    )
  }

  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.status === 404
    return (
      <div>
        <PageHeader title={notFound ? 'Model not found' : 'Transformation'} breadcrumbs={[{ label: 'Transformations', to: listPath }, { label: transformationId }]} />
        {notFound ? (
          <EmptyState
            icon={GitBranch}
            title="This dbt model does not exist"
            description="It may have been removed from the dbt project, or the link is incorrect."
            action={
              <Button asChild size="sm" variant="outline">
                <Link to={listPath}>Back to transformations</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={query.error} title="Could not load this model" onRetry={() => query.refetch()} />
        )}
      </div>
    )
  }

  if (!t) return null

  // The id resolves, but to a model of another workspace's dbt project (for example after switching
  // workspace), or this workspace has no dbt project at all.
  const projectMissing = isApiError(project.error) && project.error.status === 404
  if ((project.data && t.project_id !== project.data.id) || projectMissing) {
    return (
      <div>
        <PageHeader title="Model not in this workspace" breadcrumbs={[{ label: 'Transformations', to: listPath }, { label: t.name }]} />
        <EmptyState
          icon={GitBranch}
          title="This model belongs to a different workspace"
          description={`${t.name} is part of another workspace's dbt project. Open it from that workspace, or browse this workspace's models.`}
          action={
            <Button asChild size="sm" variant="outline">
              <Link to={listPath}>Back to transformations</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const runTests = async () => {
    try {
      const run = await testMutation.mutateAsync()
      setTriggered((prev) => ({ ...prev, dbt_test: run.id }))
      toastSuccess(`dbt test queued for ${t.name}`, isMockMode ? `Simulated run ${run.id}. No warehouse is touched in demo mode.` : `Run ${run.id}`)
    } catch (error) {
      if (isApiError(error) && error.status === 409 && typeof error.details?.run_id === 'string') {
        const runId = error.details.run_id
        setTriggered((prev) => ({ ...prev, dbt_test: runId }))
      }
      toastError(error, 'Could not start dbt test')
    }
  }

  const failingTests = t.tests.failed
  const hasTests = t.tests.total > 0

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: 'Transformations', to: listPath }, { label: t.name }]}
        title={<span className="font-mono">{t.name}</span>}
        meta={
          <>
            <LayerBadge layer={t.type} />
            <Badge variant="outline" className="font-normal">
              {t.materialization}
            </Badge>
            <RunStatusBadge status={t.last_run_status} />
          </>
        }
        description={t.description}
        actions={
          <>
            <GatedButton
              allowed={canRun && !testActive && hasTests}
              reason={
                !canRun
                  ? PERMISSION_REASONS.run
                  : !hasTests
                    ? 'This model has no tests defined. Add tests to its schema.yml in the dbt repository first.'
                    : 'dbt test is already running for this model. Wait for it to finish.'
              }
              variant="outline"
              size="sm"
              loading={testMutation.isPending}
              onClick={runTests}
            >
              {!testMutation.isPending ? <FlaskConical className="size-3.5" aria-hidden /> : null}
              Run tests
            </GatedButton>
            <GatedButton
              allowed={canRun && !runActive}
              reason={canRun ? 'A dbt run is already in progress for this model. Wait for it to finish.' : PERMISSION_REASONS.run}
              size="sm"
              onClick={() => setRunDialogOpen(true)}
            >
              <Play className="size-3.5" aria-hidden />
              Run model
            </GatedButton>
          </>
        }
      />

      <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1">
          <span className="truncate font-mono">{t.unique_id}</span>
          <CopyButton value={t.unique_id} label="Copy dbt unique ID" className="size-6" />
        </span>
        <span>
          Schema <span className="font-mono text-foreground">{t.schema}</span>
        </span>
        <span>Owner {t.owner}</span>
        <span>
          Changed <TimeAgo value={t.updated_at} />
        </span>
        {t.tags.length ? (
          <span className="flex flex-wrap gap-1" aria-label="Tags">
            {t.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="font-normal">
                {tag}
              </Badge>
            ))}
          </span>
        ) : null}
      </div>

      {liveRunIds.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {liveRunIds.map((id) => (
            <ActiveRunPanel key={id} workspaceId={workspaceId} runId={id} onDismiss={() => setDismissed((prev) => [...prev, id])} />
          ))}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Model views">
          <TabsTrigger value="sql">SQL</TabsTrigger>
          <TabsTrigger value="columns">
            Columns <span className="text-xs text-subtle-foreground tabular">{t.columns.length}</span>
          </TabsTrigger>
          <TabsTrigger value="lineage">Lineage</TabsTrigger>
          <TabsTrigger value="tests">
            Tests
            {failingTests ? (
              <Badge variant="danger" className="px-1">
                {failingTests} failing
              </Badge>
            ) : (
              <span className="text-xs text-subtle-foreground tabular">{t.tests.total}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        {/* Kept mounted so unsaved SQL edits survive switching tabs. */}
        <TabsContent value="sql" forceMount className="data-[state=inactive]:hidden">
          <SqlTab transformation={t} project={project.data} />
        </TabsContent>
        <TabsContent value="columns">
          <ColumnsTab columns={t.columns} />
        </TabsContent>
        <TabsContent value="lineage">
          <ModelLineageTab workspaceId={workspaceId} modelId={t.output_model_id} transformationByModel={transformationByModel} />
        </TabsContent>
        <TabsContent value="tests">
          <TestsTab transformationId={t.id} />
        </TabsContent>
        <TabsContent value="runs">
          <ModelRunsTab workspaceId={workspaceId} transformationId={t.id} />
        </TabsContent>
        <TabsContent value="preview">
          <PreviewTab workspaceId={workspaceId} modelId={t.output_model_id} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsTab workspaceId={workspaceId} transformation={t} project={project.data} />
        </TabsContent>
      </Tabs>

      <RunModelDialog
        transformation={t}
        open={runDialogOpen}
        onOpenChange={setRunDialogOpen}
        onTriggered={(runId) => setTriggered((prev) => ({ ...prev, transformation: runId }))}
      />
    </div>
  )
}
