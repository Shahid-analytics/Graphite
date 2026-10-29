import { ArrowRight, CalendarClock, Pause, Pencil, Play, SearchX, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { HelpTip, KeyValueGrid, TimeAgo } from '@/components/data/display'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { PageHeader, Section } from '@/components/layout/page-header'
import { DisabledReason } from '@/components/runs/disabled-reason'
import { RunProgress } from '@/components/runs/run-progress'
import { StageFlow } from '@/components/runs/stage-flow'
import { useRun } from '@/components/runs/use-run'
import { useRefreshOnRunSettled } from '@/components/runs/use-run-settled'
import { RunStatusBadge, SourceStatusBadge } from '@/components/status/status-badge'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDateTime, formatDuration, formatPercent } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import { isTerminal, type Pipeline } from '@/types'
import { EditPipelineDialog } from '../components/edit-pipeline-dialog'
import { PipelineHistory } from '../components/pipeline-history'
import { RunPipelineButton } from '../components/run-pipeline-button'
import { statusToggle } from '../lib/pipeline-state'
import { useTogglePipelineStatus } from '../lib/use-pipeline-actions'
import { useDeletePipeline, usePipeline, useSchedule, useWorkspaceSources } from '../queries'

export default function PipelineDetailPage() {
  const { pipelineId } = useParams()
  const { workspaceId } = useWorkspace()
  const pipeline = usePipeline(pipelineId)
  const crumbs = [{ label: 'Pipelines & Sync Jobs', to: wsPath(workspaceId, 'pipelines') }]

  if (pipeline.isPending) return <PageSkeleton />

  const notFound = (isApiError(pipeline.error) && pipeline.error.status === 404) || (pipeline.data && pipeline.data.workspace_id !== workspaceId)
  if (notFound || pipeline.error || !pipeline.data) {
    return (
      <div>
        <PageHeader title="Pipeline" breadcrumbs={[...crumbs, { label: pipelineId ?? 'Unknown' }]} />
        {notFound ? (
          <EmptyState
            icon={SearchX}
            title="Pipeline not found"
            description="It may have been deleted, or it belongs to another workspace."
            action={
              <Button asChild variant="outline">
                <Link to={wsPath(workspaceId, 'pipelines')}>Back to pipelines</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={pipeline.error} title="Could not load this pipeline" onRetry={() => void pipeline.refetch()} />
        )}
      </div>
    )
  }

  // Keyed so dialog, filter and paging state reset when navigating between pipelines.
  return <PipelineDetail key={pipeline.data.id} pipeline={pipeline.data} workspaceId={workspaceId} crumbs={crumbs} />
}

function PipelineDetail({ pipeline, workspaceId, crumbs }: { pipeline: Pipeline; workspaceId: string; crumbs: { label: string; to: string }[] }) {
  const navigate = useNavigate()
  const canWrite = usePermission('pipelines:write')
  const canSchedule = usePermission('schedules:write')
  const sources = useWorkspaceSources(workspaceId)
  const schedule = useSchedule(pipeline.schedule_id)
  const statusAction = useTogglePipelineStatus()
  const remove = useDeletePipeline()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const toggle = statusToggle(pipeline)
  const writeReason = canWrite ? null : 'Requires the "pipelines:write" permission (admin or owner).'

  const sourceLinks = pipeline.source_ids.map((id) => {
    const source = sources.data?.find((s) => s.id === id)
    return { id, name: source?.name ?? id, health: source?.health }
  })

  const confirmDelete = async () => {
    try {
      await remove.mutateAsync(pipeline.id)
      toastSuccess(`${pipeline.name} deleted`, 'Its run history remains available in the audit trail.')
      navigate(wsPath(workspaceId, 'pipelines'))
    } catch (error) {
      toastError(error, 'Could not delete the pipeline')
      throw error
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={pipeline.name}
        meta={<SourceStatusBadge status={pipeline.status} />}
        description={pipeline.description || undefined}
        breadcrumbs={[...crumbs, { label: pipeline.name }]}
        className="mb-0"
        actions={
          <>
            <RunPipelineButton pipeline={pipeline} />
            <DisabledReason reason={writeReason}>
              <Button variant="outline" disabled={!canWrite} loading={statusAction.isPending} onClick={() => void statusAction.toggle(pipeline)}>
                {!statusAction.isPending ? toggle.next === 'paused' ? <Pause aria-hidden /> : <Play aria-hidden /> : null}
                {toggle.label}
              </Button>
            </DisabledReason>
            <DisabledReason reason={writeReason}>
              <Button variant="outline" disabled={!canWrite} onClick={() => setEditing(true)}>
                <Pencil aria-hidden />
                Edit
              </Button>
            </DisabledReason>
            <DisabledReason reason={writeReason}>
              <Button variant="outline" size="icon" disabled={!canWrite} onClick={() => setDeleting(true)} aria-label="Delete pipeline" className="text-danger hover:text-danger">
                <Trash2 aria-hidden />
              </Button>
            </DisabledReason>
          </>
        }
      />

      {pipeline.status === 'draft' ? (
        <Notice tone="info" title="Draft pipeline">
          Drafts cannot run or be scheduled. Review the configuration, then use Activate to enable runs.
        </Notice>
      ) : pipeline.status === 'paused' ? (
        <Notice tone="warning" title="Paused">
          Scheduled runs are skipped and manual runs are disabled until the pipeline is resumed.
        </Notice>
      ) : null}

      <LatestRun pipeline={pipeline} workspaceId={workspaceId} />

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValueGrid
            columns={3}
            items={[
              {
                label: 'Sources',
                value: (
                  <span className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {sourceLinks.map((s, i) => (
                      <span key={s.id}>
                        <Link to={wsPath(workspaceId, 'sources', s.id)} className="hover:underline">
                          {s.name}
                        </Link>
                        {s.health === 'unhealthy' ? <span className="ml-1 text-xs text-danger">(unhealthy)</span> : s.health === 'degraded' ? <span className="ml-1 text-xs text-warning">(degraded)</span> : null}
                        {i < sourceLinks.length - 1 ? ',' : ''}
                      </span>
                    ))}
                  </span>
                ),
              },
              {
                label: (
                  <span className="inline-flex items-center gap-1">
                    dbt selector
                    <HelpTip label="About the dbt selector">The dbt node selection used for the transformation stage, as in dbt build --select.</HelpTip>
                  </span>
                ),
                value: pipeline.dbt_selector,
                mono: true,
              },
              {
                label: 'Schedule',
                value: pipeline.schedule_id ? (
                  <Link to={wsPath(workspaceId, 'schedules', pipeline.schedule_id)} className="inline-flex items-center gap-1 hover:underline">
                    <CalendarClock className="size-3.5 text-muted-foreground" aria-hidden />
                    {schedule.isPending ? <Skeleton className="h-3.5 w-28" /> : (schedule.data?.name ?? 'View schedule')}
                  </Link>
                ) : canSchedule && pipeline.status !== 'draft' ? (
                  <Link to={`${wsPath(workspaceId, 'schedules', 'new')}?target_type=pipeline&target_id=${encodeURIComponent(pipeline.id)}`} className="text-muted-foreground hover:text-foreground hover:underline">
                    Not scheduled. Create a schedule
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Not scheduled</span>
                ),
              },
              { label: 'Next run', value: pipeline.next_run_at ? <TimeAgo value={pipeline.next_run_at} /> : <span className="text-muted-foreground">None planned</span> },
              {
                label: 'Success rate (7 days)',
                value: pipeline.success_rate_7d === null ? <span className="text-muted-foreground">No finished runs</span> : formatPercent(pipeline.success_rate_7d, 0),
              },
              { label: 'Average duration', value: formatDuration(pipeline.avg_duration_seconds) },
              { label: 'Quality checks', value: pipeline.quality_checks_enabled ? 'Enabled' : 'Disabled' },
              { label: 'Metabase refresh', value: pipeline.metabase_refresh_enabled ? 'Enabled' : 'Disabled' },
              { label: 'Owner', value: pipeline.owner.name },
              { label: 'Created', value: formatDateTime(pipeline.created_at) },
              { label: 'Last updated', value: <TimeAgo value={pipeline.updated_at} /> },
              { label: 'Pipeline ID', value: pipeline.id, mono: true },
            ]}
          />
        </CardContent>
      </Card>

      <PipelineHistory pipelineId={pipeline.id} workspaceId={workspaceId} />

      {editing ? <EditPipelineDialog pipeline={pipeline} onOpenChange={setEditing} /> : null}
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={`Delete ${pipeline.name}?`}
        description="The pipeline configuration is removed permanently. Bronze, Silver and Gold tables and past run records are not deleted."
        confirmLabel="Delete pipeline"
        destructive
        confirmText={pipeline.name}
        onConfirm={confirmDelete}
      >
        {pipeline.schedule_id ? (
          <Notice tone="warning">
            {schedule.data ? `"${schedule.data.name}"` : 'A schedule'} targets this pipeline. Delete or retarget the schedule first; otherwise the deletion is
            rejected.
          </Notice>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}

function LatestRun({ pipeline, workspaceId }: { pipeline: Pipeline; workspaceId: string }) {
  const summary = pipeline.last_run
  const run = useRun(summary?.id)
  useRefreshOnRunSettled(run.data)
  const live = run.data ?? null
  const active = live ? !isTerminal(live.status) : summary ? !isTerminal(summary.status) : false

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          Latest run
          {summary ? <SimulatedBadge /> : null}
        </span>
      }
      action={
        summary ? (
          <Button asChild variant="ghost" size="sm">
            <Link to={wsPath(workspaceId, 'runs', summary.id)}>
              {active ? 'Open live run' : 'Open run'}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        ) : null
      }
    >
      <Card>
        <CardContent className="space-y-4 pt-5">
          {!summary ? (
            <>
              <p className="text-sm text-muted-foreground">This pipeline has not run yet. Each run executes these stages:</p>
              <StageFlow planned={pipeline.stages} label="Configured stages" />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                <span aria-live="polite">
                  <RunStatusBadge status={live?.status ?? summary.status} />
                </span>
                <span className="font-mono text-xs text-muted-foreground">{summary.id}</span>
                <span className="text-muted-foreground">
                  {summary.started_at ? 'Started ' : 'Queued '}
                  <TimeAgo value={summary.started_at ?? summary.queued_at} />
                </span>
                {(live?.duration_seconds ?? summary.duration_seconds) !== null ? (
                  <span className="text-muted-foreground">Duration {formatDuration(live?.duration_seconds ?? summary.duration_seconds)}</span>
                ) : null}
              </div>
              {run.isPending ? (
                <Skeleton className="h-14 w-full" />
              ) : run.error ? (
                <ErrorState compact error={run.error} title="Could not load the latest run" onRetry={() => void run.refetch()} />
              ) : live ? (
                <>
                  <StageFlow stages={live.stages} label="Latest run stages" />
                  {active ? <RunProgress run={live} /> : null}
                  {live.status === 'failed' && live.error ? (
                    <Notice
                      tone="danger"
                      title={live.error.message}
                      action={
                        <Button asChild variant="outline" size="sm">
                          <Link to={wsPath(workspaceId, 'runs', live.id)}>See error details</Link>
                        </Button>
                      }
                    >
                      <span className="font-mono text-xs">{live.error.code}</span>
                    </Notice>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </Section>
  )
}
