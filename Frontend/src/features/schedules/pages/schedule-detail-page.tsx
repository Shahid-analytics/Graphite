import { CalendarX, Pencil, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CopyButton, HelpTip, KeyValueGrid, TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { RunStatusBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { describeCron } from '@/lib/cron'
import { formatDateTime } from '@/lib/format'
import { isApiError } from '@/services/api-error'
import { DeleteScheduleDialog } from '../components/delete-schedule-dialog'
import { ExecutionHistory } from '../components/execution-history'
import { Gated, permissionReason } from '../components/gated'
import { NextRunsCard } from '../components/next-runs-card'
import { RunProgress } from '../components/run-progress'
import { ScheduleEnabledSwitch } from '../components/schedule-enabled-switch'
import { SchedulerNote } from '../components/scheduler-note'
import { TargetLabel } from '../components/target-label'
import { useRunNow } from '../components/use-run-now'
import { TARGET_META, describeConcurrency, describeRetry, overlapLabel, runPermissionFor } from '../lib/schedule-utils'
import { useSchedule } from '../queries'

export default function ScheduleDetailPage() {
  const { scheduleId } = useParams()
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const schedule = useSchedule(scheduleId)
  const canWrite = usePermission('schedules:write')
  const runPermission = runPermissionFor(schedule.data?.target_type ?? 'pipeline')
  const canRun = usePermission(runPermission)
  // Remembers which schedule the run belongs to, so navigating to another schedule does not show its progress.
  const [activeRun, setActiveRun] = useState<{ scheduleId: string; runId: string } | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const { runNow, isPending: runPending } = useRunNow((run) => setActiveRun({ scheduleId: scheduleId ?? '', runId: run.id }))
  const activeRunId = activeRun && activeRun.scheduleId === scheduleId ? activeRun.runId : null

  const listPath = wsPath(workspaceId, 'schedules')
  const breadcrumbs = (label: string) => [{ label: 'Schedules', to: listPath }, { label }]

  const notFound = (
    <div>
      <PageHeader title="Schedule not found" breadcrumbs={breadcrumbs('Not found')} />
      <EmptyState
        icon={CalendarX}
        title="This schedule does not exist"
        description="It may have been deleted, or the link points to another workspace."
        action={
          <Button asChild variant="outline">
            <Link to={listPath}>Back to schedules</Link>
          </Button>
        }
      />
    </div>
  )

  if (schedule.isLoading) return <PageSkeleton />
  if (schedule.isError) {
    if (isApiError(schedule.error) && schedule.error.status === 404) return notFound
    return (
      <div>
        <PageHeader title="Schedule" breadcrumbs={breadcrumbs('Schedule')} />
        <ErrorState error={schedule.error} title="Could not load this schedule" onRetry={() => void schedule.refetch()} />
      </div>
    )
  }

  const s = schedule.data!
  // A schedule from another workspace must not render under this workspace's URL.
  if (s.workspace_id !== workspaceId) return notFound
  const target = TARGET_META[s.target_type]
  const TargetIcon = target.icon

  return (
    <div>
      <PageHeader
        title={s.name}
        breadcrumbs={breadcrumbs(s.name)}
        description={s.description || undefined}
        meta={
          <>
            <Badge variant={s.enabled ? 'success' : 'outline'}>{s.enabled ? 'Enabled' : 'Disabled'}</Badge>
            <Badge variant="outline" className="gap-1">
              <TargetIcon aria-hidden />
              {target.label}
            </Badge>
          </>
        }
        actions={
          <>
            <div className="mr-1 flex items-center rounded-md border border-border px-2.5 py-1.5">
              <ScheduleEnabledSwitch schedule={s} withLabel />
            </div>
            <Gated allowed={canRun} reason={permissionReason(runPermission)}>
              <Button variant="outline" onClick={() => void runNow(s)} loading={runPending} disabled={!canRun}>
                {runPending ? null : <Play aria-hidden />}
                Run now
              </Button>
            </Gated>
            <Gated allowed={canWrite} reason={permissionReason('schedules:write')}>
              {canWrite ? (
                <Button variant="outline" asChild>
                  <Link to={wsPath(workspaceId, 'schedules', s.id, 'edit')}>
                    <Pencil aria-hidden />
                    Edit
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <Pencil aria-hidden />
                  Edit
                </Button>
              )}
            </Gated>
            <Gated allowed={canWrite} reason={permissionReason('schedules:write')}>
              <Button variant="outline" onClick={() => setDeleteOpen(true)} disabled={!canWrite}>
                <Trash2 aria-hidden />
                Delete
              </Button>
            </Gated>
          </>
        }
      />

      {activeRunId ? <RunProgress runId={activeRunId} onDismiss={() => setActiveRun(null)} /> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle>
              <h2 className="text-sm font-semibold">Configuration</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueGrid
              items={[
                { label: 'Target', value: <TargetLabel schedule={s} showType /> },
                { label: 'Cadence', value: <span title={describeCron(s.cron)}>{describeCron(s.cron)}</span> },
                {
                  label: 'Cron expression',
                  value: (
                    <span className="inline-flex items-center gap-1">
                      <code className="font-mono text-[13px]">{s.cron}</code>
                      <CopyButton value={s.cron} label="Copy cron expression" className="size-6" />
                    </span>
                  ),
                },
                { label: 'Timezone', value: s.timezone },
                {
                  label: (
                    <span className="inline-flex items-center gap-1">
                      Retry policy
                      <HelpTip label="About retries">
                        Retryable failures (timeouts, rate limits, transient connection errors) are retried by the backend scheduler after the backoff
                        delay. Exponential backoff doubles the delay after each attempt.
                      </HelpTip>
                    </span>
                  ),
                  value: <span title={describeRetry(s.retry)}>{describeRetry(s.retry)}</span>,
                },
                {
                  label: (
                    <span className="inline-flex items-center gap-1">
                      Concurrency
                      <HelpTip label="About concurrency">
                        Overlap policy "{overlapLabel(s.concurrency.overlap_policy)}" applies when a run is due while{' '}
                        {s.concurrency.max_concurrent_runs === 1 ? 'another run' : `${s.concurrency.max_concurrent_runs} runs`} of this target are still in
                        progress.
                      </HelpTip>
                    </span>
                  ),
                  value: <span title={describeConcurrency(s)}>{describeConcurrency(s)}</span>,
                },
                {
                  label: 'Next run',
                  value: s.enabled ? (
                    <span className="inline-flex items-center gap-1.5">
                      <TimeAgo value={s.next_run_at} />
                      <span className="text-xs text-muted-foreground">{formatDateTime(s.next_run_at)}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Disabled</span>
                  ),
                },
                {
                  label: 'Last run',
                  value: s.last_run ? (
                    <span className="inline-flex items-center gap-2">
                      <Link to={wsPath(workspaceId, 'runs', s.last_run.id)} className="rounded-md" aria-label={`Open last run ${s.last_run.id}`}>
                        <RunStatusBadge status={s.last_run.status} />
                      </Link>
                      <TimeAgo value={s.last_run.finished_at ?? s.last_run.started_at ?? s.last_run.queued_at} className="text-xs text-muted-foreground" />
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Never run</span>
                  ),
                },
                {
                  label: 'Created by',
                  value: (
                    <span>
                      {s.created_by.name} <span className="text-xs text-muted-foreground">on {formatDateTime(s.created_at)}</span>
                    </span>
                  ),
                },
                { label: 'Last updated', value: <TimeAgo value={s.updated_at} /> },
              ]}
            />
            {s.last_run?.status === 'failed' && s.last_run.error_message ? (
              <p className="mt-4 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm">
                <span className="font-medium">Last run failed: </span>
                <span className="text-muted-foreground">{s.last_run.error_message}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>

        <NextRunsCard schedule={s} />
      </div>

      <div className="mt-6">
        <ExecutionHistory key={s.id} schedule={s} />
      </div>

      <SchedulerNote className="mt-6" />

      <DeleteScheduleDialog schedule={s} open={deleteOpen} onOpenChange={setDeleteOpen} onDeleted={() => navigate(listPath, { replace: true })} />
    </div>
  )
}
