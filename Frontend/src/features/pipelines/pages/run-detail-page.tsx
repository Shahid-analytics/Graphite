import { SearchX } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { CopyButton, KeyValueGrid, TimeAgo } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { PageHeader, Section } from '@/components/layout/page-header'
import { RUN_KIND_LABELS, RUN_TRIGGER_LABELS, runTarget } from '@/components/runs/labels'
import { LogViewer } from '@/components/runs/log-viewer'
import { RunActions } from '@/components/runs/run-actions'
import { RunErrorPanel } from '@/components/runs/run-error-panel'
import { RunProgress } from '@/components/runs/run-progress'
import { StageFlow } from '@/components/runs/stage-flow'
import { StageTimeline } from '@/components/runs/stage-timeline'
import { TableResults } from '@/components/runs/table-results'
import { useRun } from '@/components/runs/use-run'
import { useRefreshOnRunSettled } from '@/components/runs/use-run-settled'
import { RunStatusBadge } from '@/components/status/status-badge'
import { SimulatedBadge } from '@/components/status/simulated'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { formatDateTimeSeconds, formatDuration, formatNumber } from '@/lib/format'
import { isApiError } from '@/services/api-error'
import { isTerminal, type Run } from '@/types'

export default function RunDetailPage() {
  const { runId } = useParams()
  const { workspaceId } = useWorkspace()
  const run = useRun(runId)
  useRefreshOnRunSettled(run.data)

  if (run.isPending) return <PageSkeleton />

  const notFound = (isApiError(run.error) && run.error.status === 404) || (run.data && run.data.workspace_id !== workspaceId)
  if (notFound || run.error || !run.data) {
    return (
      <div>
        <PageHeader title="Run" breadcrumbs={[{ label: 'Pipelines & Sync Jobs', to: wsPath(workspaceId, 'pipelines') }, { label: runId ?? 'Unknown run' }]} />
        {notFound ? (
          <EmptyState
            icon={SearchX}
            title="Run not found"
            description="The run may have expired from history, or it belongs to another workspace."
            action={
              <Button asChild variant="outline">
                <Link to={wsPath(workspaceId, 'pipelines')}>Back to pipelines</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={run.error} title="Could not load this run" onRetry={() => void run.refetch()} />
        )}
      </div>
    )
  }

  return <RunDetail run={run.data} workspaceId={workspaceId} />
}

function RunDetail({ run, workspaceId }: { run: Run; workspaceId: string }) {
  const target = runTarget(workspaceId, run)
  const active = !isTerminal(run.status)
  const breadcrumbs = [
    { label: target.section.label, to: target.section.path },
    ...(target.resource ? [{ label: target.resource.label, to: target.resource.path }] : []),
    { label: run.id },
  ]
  // Pipeline-level stages (all seven) read best with the excluded ones visible; single-purpose runs do not.
  const hideExcluded = run.kind !== 'pipeline'

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${RUN_KIND_LABELS[run.kind]}: ${run.target_name}`}
        breadcrumbs={breadcrumbs}
        className="mb-0"
        meta={
          <>
            <span role="status" aria-live="polite" aria-atomic="true">
              <span className="sr-only">Run status: </span>
              <RunStatusBadge status={run.status} />
            </span>
            <SimulatedBadge />
          </>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-1">
            <span className="font-mono text-xs">{run.id}</span>
            <CopyButton value={run.id} label="Copy run ID" className="size-6" />
          </span>
        }
        actions={<RunActions run={run} size="default" />}
      />

      {isMockMode ? (
        <Notice tone="neutral" title="Simulated execution. No data was moved." action={<SimulatedBadge />}>
          This run was produced by the in-browser demo API. Stages, timings, record counts and logs are generated; no source, warehouse, dbt project or
          Metabase instance was contacted.
        </Notice>
      ) : null}

      {isMockMode && run.status !== 'failed' && run.stages.some((s) => s.key === 'metabase_refresh' && s.status === 'skipped') ? (
        <Notice
          tone="info"
          title="Metabase was not refreshed"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to={wsPath(workspaceId, 'settings', 'metabase')}>Metabase settings</Link>
            </Button>
          }
        >
          The demo API cannot reach a Metabase instance, so simulated runs skip the refresh instead of reporting it as done. Dashboards are refreshed
          only when a live backend is connected to Metabase.
        </Notice>
      ) : null}

      {active ? (
        <Card>
          <CardContent className="pt-5">
            <RunProgress run={run} />
          </CardContent>
        </Card>
      ) : null}

      {run.status === 'failed' ? <RunErrorPanel run={run} workspaceId={workspaceId} /> : null}

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValueGrid
            columns={4}
            items={[
              { label: 'Kind', value: <Badge variant="outline">{RUN_KIND_LABELS[run.kind]}</Badge> },
              {
                label: target.resource?.type ?? 'Target',
                value: target.resource ? (
                  <Link to={target.resource.path} className="hover:underline">
                    {run.target_name}
                  </Link>
                ) : (
                  run.target_name
                ),
              },
              {
                label: 'Trigger',
                value: run.schedule_id ? (
                  <span>
                    {RUN_TRIGGER_LABELS[run.trigger]} (
                    <Link to={wsPath(workspaceId, 'schedules', run.schedule_id)} className="hover:underline">
                      schedule
                    </Link>
                    )
                  </span>
                ) : (
                  RUN_TRIGGER_LABELS[run.trigger]
                ),
              },
              { label: 'Triggered by', value: run.triggered_by.name },
              {
                label: 'Attempt',
                value: run.retry_of ? (
                  <span>
                    {run.attempt}, retry of{' '}
                    <Link to={wsPath(workspaceId, 'runs', run.retry_of)} className="font-mono text-[13px] hover:underline">
                      {run.retry_of}
                    </Link>
                  </span>
                ) : (
                  run.attempt
                ),
              },
              { label: 'Queued', value: <TimeStamp value={run.queued_at} /> },
              { label: 'Started', value: <TimeStamp value={run.started_at} empty={active ? 'Waiting for a worker' : 'Did not start'} /> },
              { label: 'Finished', value: <TimeStamp value={run.finished_at} empty={active ? 'In progress' : '—'} /> },
              { label: active ? 'Elapsed' : 'Duration', value: <span className="tabular">{formatDuration(run.duration_seconds)}</span> },
              { label: 'Records processed', value: <span className="tabular">{formatNumber(run.records_processed)}</span> },
              { label: 'Tables', value: run.tables.length ? <span className="tabular">{run.tables.length}</span> : <span className="text-muted-foreground">Not applicable</span> },
            ]}
          />
        </CardContent>
      </Card>

      <Section title="Stages" description="Each stage of the flow, with timings, metrics and errors.">
        <Card>
          <CardContent className="space-y-6 pt-5">
            <StageFlow stages={run.stages} hideExcluded={hideExcluded} label="Run stages" />
            <StageTimeline stages={run.stages} />
          </CardContent>
        </Card>
      </Section>

      {run.tables.length ? (
        <Section title="Ingestion results" description="Rows extracted per source table and the load mode used.">
          <TableResults tables={run.tables} />
        </Section>
      ) : null}

      <Section title="Logs" description={active ? 'New lines appear every 2 seconds while the run is active.' : 'Complete log output for this run.'}>
        <LogViewer runId={run.id} />
      </Section>
    </div>
  )
}

function TimeStamp({ value, empty = '—' }: { value: string | null; empty?: string }) {
  if (!value) return <span className="text-muted-foreground">{empty}</span>
  return (
    <span className="flex flex-col">
      <span className="tabular">{formatDateTimeSeconds(value)}</span>
      <TimeAgo value={value} className="text-xs text-muted-foreground" />
    </span>
  )
}
