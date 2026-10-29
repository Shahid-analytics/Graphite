import { Ban, CheckCircle2, CircleDashed, ExternalLink, Loader2, SkipForward, XCircle, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { ErrorState } from '@/components/feedback/states'
import { useRun } from '@/components/runs/use-run'
import { RunStatusBadge } from '@/components/status/status-badge'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { wsPath } from '@/hooks/use-workspace'
import { formatDuration, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isTerminal, type RunStatus } from '@/types'

const STAGE_ICON: Record<RunStatus, { icon: LucideIcon; className: string }> = {
  queued: { icon: CircleDashed, className: 'text-subtle-foreground' },
  running: { icon: Loader2, className: 'animate-spin text-running' },
  succeeded: { icon: CheckCircle2, className: 'text-success' },
  failed: { icon: XCircle, className: 'text-danger' },
  cancelled: { icon: Ban, className: 'text-muted-foreground' },
  skipped: { icon: SkipForward, className: 'text-subtle-foreground' },
}

const STATUS_SENTENCE: Record<RunStatus, string> = {
  queued: 'The initial sync is queued.',
  running: 'The initial sync is running.',
  succeeded: 'The initial sync finished.',
  failed: 'The initial sync failed.',
  cancelled: 'The initial sync was cancelled.',
  skipped: 'The initial sync was skipped.',
}

/** Live progress of the first ingestion run, polled until it reaches a terminal state. */
export function InitialRunProgress({ workspaceId, runId }: { workspaceId: string; runId: string }) {
  const query = useRun(runId)
  const run = query.data

  if (query.isLoading) {
    return (
      <div className="space-y-3 rounded-lg border border-border p-4" aria-busy="true" aria-label="Loading run">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    )
  }
  if (query.isError || !run) {
    return <ErrorState compact error={query.error} title="Could not load the initial sync" onRetry={() => query.refetch()} />
  }

  const finishedStages = run.stages.filter((s) => isTerminal(s.status)).length
  const percent = run.stages.length ? Math.round((finishedStages / run.stages.length) * 100) : isTerminal(run.status) ? 100 : 0

  return (
    <div className="rounded-lg border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <p className="text-sm font-semibold">Initial sync</p>
        <RunStatusBadge status={run.status} />
        <SimulatedBadge reason="This run is simulated by the in-browser mock API. No data was copied from your source." />
        <Button asChild variant="link" size="sm" className="ml-auto text-xs">
          <Link to={wsPath(workspaceId, 'runs', run.id)}>
            Open run details
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        </Button>
      </div>
      <div className="space-y-3 px-4 py-4">
        <p className="sr-only" aria-live="polite" role="status">
          {STATUS_SENTENCE[run.status]}
        </p>
        <div className="flex items-center gap-3">
          <Progress value={percent} aria-label="Initial sync progress" className="flex-1" />
          <span className="w-10 text-right text-xs text-muted-foreground tabular">{percent}%</span>
        </div>
        <ol className="grid gap-2 sm:grid-cols-2" aria-label="Run stages">
          {run.stages.map((stage) => {
            const meta = STAGE_ICON[stage.status]
            const Icon = meta.icon
            return (
              <li key={stage.key} className="flex items-center gap-2 text-sm">
                <Icon className={cn('size-4 shrink-0', meta.className)} aria-hidden />
                <span className={cn(stage.status === 'queued' && 'text-muted-foreground')}>{stage.name}</span>
                <span className="sr-only">{stage.status}</span>
                {stage.duration_seconds !== null ? (
                  <span className="ml-auto text-xs text-subtle-foreground tabular">{formatDuration(stage.duration_seconds)}</span>
                ) : null}
              </li>
            )
          })}
        </ol>
        <p className="text-xs text-muted-foreground">
          {run.records_processed !== null ? `${formatNumber(run.records_processed)} records processed. ` : ''}
          {isTerminal(run.status)
            ? run.error
              ? run.error.message
              : 'You can follow future syncs from the source page.'
            : 'You can continue setup while this runs; progress is also shown on the run page.'}
        </p>
      </div>
    </div>
  )
}
