import { GitBranch, Settings } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router'
import { StatTile } from '@/components/data/display'
import { CardsSkeleton, EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatNumber, formatPercent } from '@/lib/format'
import { isApiError } from '@/services/api-error'
import type { TransformationSummary } from '@/types'
import { MappingCallout } from '../components/mapping-callout'
import { ModelsTab } from '../components/models-tab'
import { ProjectSummary } from '../components/project-summary'
import { RunHistoryTab } from '../components/run-history-tab'
import { WorkspaceLineageTab } from '../components/workspace-lineage-tab'
import { useTabParam } from '../lib/use-tab-param'
import { useDbtProject, useTransformations } from '../queries'

const TABS = ['models', 'lineage', 'runs'] as const

function Stats({ models }: { models: TransformationSummary[] }) {
  const tests = models.reduce(
    (acc, t) => ({ total: acc.total + t.tests.total, passed: acc.passed + t.tests.passed, failed: acc.failed + t.tests.failed, warned: acc.warned + t.tests.warned }),
    { total: 0, passed: 0, failed: 0, warned: 0 },
  )
  const failingModels = models.filter((t) => t.tests.failed > 0).length
  const failedRuns = models.filter((t) => t.last_run_status === 'failed').length
  const running = models.filter((t) => t.last_run_status === 'running' || t.last_run_status === 'queued').length
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="Models" value={formatNumber(models.length)} hint={running ? `${running} running now` : 'Staging to Gold'} />
      <StatTile
        label="Test pass rate"
        value={tests.total ? formatPercent(tests.passed / tests.total) : '—'}
        hint={`${formatNumber(tests.passed)} of ${formatNumber(tests.total)} tests passing`}
      />
      <StatTile
        label="Failing tests"
        value={formatNumber(tests.failed)}
        tone={tests.failed ? 'danger' : undefined}
        hint={tests.failed ? `Across ${failingModels} ${failingModels === 1 ? 'model' : 'models'}; ${tests.warned} warnings` : `${tests.warned} warnings`}
      />
      <StatTile
        label="Failed last runs"
        value={formatNumber(failedRuns)}
        tone={failedRuns ? 'danger' : undefined}
        hint={failedRuns ? 'Models whose latest dbt run failed' : 'No model failed on its latest run'}
      />
    </div>
  )
}

export default function TransformationsPage() {
  const { workspaceId } = useWorkspace()
  const [tab, setTab] = useTabParam(TABS, 'models')
  const project = useDbtProject(workspaceId)
  const notConfigured = isApiError(project.error) && project.error.status === 404
  const all = useTransformations(workspaceId, {}, project.isSuccess)

  const transformationByModel = useMemo(
    () => new Map((all.data ?? []).filter((t) => t.output_model_id).map((t) => [t.output_model_id!, t.id])),
    [all.data],
  )
  const allTags = useMemo(() => [...new Set((all.data ?? []).flatMap((t) => t.tags))].sort(), [all.data])

  const header = (
    <PageHeader
      title="Transformations"
      description="dbt models that turn raw Bronze tables into cleaned Silver and analytics-ready Gold models. Review SQL, run models and tests, and follow lineage."
      actions={
        project.isSuccess ? (
          <>
            <Button asChild variant="outline" size="sm">
              <Link to={wsPath(workspaceId, 'settings', 'dbt')}>
                <Settings className="size-3.5" aria-hidden />
                Project settings
              </Link>
            </Button>
          </>
        ) : null
      }
    />
  )

  if (project.isPending) {
    return (
      <div>
        {header}
        <div className="space-y-4" aria-busy="true" aria-label="Loading dbt project">
          <Skeleton className="h-24 w-full rounded-lg" />
          <CardsSkeleton />
          <TableSkeleton rows={8} columns={6} />
        </div>
      </div>
    )
  }

  if (notConfigured) {
    return (
      <div>
        {header}
        <EmptyState
          icon={GitBranch}
          title="No dbt project connected"
          description="Transformations are dbt models stored in a Git repository. Connect the repository, branch and target under Settings, then models, tests and lineage appear here."
          action={
            <Button asChild size="sm">
              <Link to={wsPath(workspaceId, 'settings', 'dbt')}>
                <Settings className="size-3.5" aria-hidden />
                Connect dbt project
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  if (project.isError) {
    return (
      <div>
        {header}
        <ErrorState error={project.error} title="Could not load the dbt project" onRetry={() => project.refetch()} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {header}
      <ProjectSummary project={project.data} />
      <MappingCallout workspaceId={workspaceId} />
      {all.isPending ? <CardsSkeleton /> : all.data ? <Stats models={all.data} /> : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList aria-label="Transformations views">
          <TabsTrigger value="models">Models</TabsTrigger>
          <TabsTrigger value="lineage">Lineage</TabsTrigger>
          <TabsTrigger value="runs">Run history</TabsTrigger>
        </TabsList>
        <TabsContent value="models">
          <ModelsTab workspaceId={workspaceId} allTags={allTags} />
        </TabsContent>
        <TabsContent value="lineage">
          <WorkspaceLineageTab workspaceId={workspaceId} transformationByModel={transformationByModel} />
        </TabsContent>
        <TabsContent value="runs">
          <RunHistoryTab workspaceId={workspaceId} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
