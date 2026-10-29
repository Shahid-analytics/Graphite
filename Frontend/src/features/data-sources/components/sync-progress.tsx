import { ArrowUpRight, Ban, CheckCircle2, CircleDashed, Loader2, SkipForward, X, XCircle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'
import { useRun } from '@/components/runs/use-run'
import { RunStatusBadge } from '@/components/status/status-badge'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDuration, formatNumber } from '@/lib/format'
import { toastError, toastInfo } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { isTerminal, type RunStage, type RunStatus } from '@/types'
import { useCancelSourceRun } from '../queries'
import { GatedButton, permissionReason } from './primitives'

const STAGE_ICON: Record<RunStatus, { icon: typeof CheckCircle2; className: string }> = {
  queued: { icon: CircleDashed, className: 'text-subtle-foreground' },
  running: { icon: Loader2, className: 'animate-spin text-running' },
  succeeded: { icon: CheckCircle2, className: 'text-success' },
  failed: { icon: XCircle, className: 'text-danger' },
  cancelled: { icon: Ban, className: 'text-muted-foreground' },
  skipped: { icon: SkipForward, className: 'text-subtle-foreground' },
}

function StageItem({ stage }: { stage: RunStage }) {
  const meta = STAGE_ICON[stage.status]
  const Icon = meta.icon
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm">
      <Icon className={cn('size-4 shrink-0', meta.className)} aria-hidden />
      <span className={cn('truncate', stage.status === 'queued' && 'text-muted-foreground')}>{stage.name}</span>
      <span className="sr-only">: {stage.status}</span>
      {stage.duration_seconds !== null ? <span className="ml-auto text-xs text-muted-foreground tabular">{formatDuration(stage.duration_seconds)}</span> : null}
    </li>
  )
}

/**
 * Live progress for a sync run. Polls the run until it is terminal and announces
 * status changes to assistive technology.
 */
export function SyncProgress({ runId, onDismiss, className }: { runId: string; onDismiss?: () => void; className?: string }) {
  const { workspaceId } = useWorkspace()
  const canSync = usePermission('sources:sync')
  const { data: run, isLoading, error } = useRun(runId)
  const cancel = useCancelSourceRun()
  const queryClient = useQueryClient()
  const settled = run ? isTerminal(run.status) : false

  // Refresh source state (last sync, health, run lists) once the run settles.
  useEffect(() => {
    if (!settled) return
    for (const queryKey of [['sources'], ['overview'], ['notifications']]) void queryClient.invalidateQueries({ queryKey })
  }, [settled, runId, queryClient])

  if (isLoading) {
    return (
      <div className={cn('rounded-lg border border-border p-4', className)} aria-busy="true">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-3 h-1.5 w-full" />
      </div>
    )
  }
  if (error || !run) {
    return (
      <div className={cn('flex items-center justify-between gap-2 rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground', className)}>
        Could not load progress for run {runId}.
        <Button asChild variant="link" size="sm">
          <Link to={wsPath(workspaceId, 'runs', runId)}>Open run</Link>
        </Button>
      </div>
    )
  }

  const done = run.stages.filter((s) => ['succeeded', 'skipped', 'failed', 'cancelled'].includes(s.status)).length
  const running = run.stages.some((s) => s.status === 'running') ? 0.5 : 0
  const pct = isTerminal(run.status) ? 100 : Math.round(((done + running) / Math.max(1, run.stages.length)) * 100)
  const terminal = isTerminal(run.status)
  const current = run.stages.find((s) => s.status === 'running')
  const announcement = terminal
    ? `Sync ${run.status}.${run.error ? ` ${run.error.message}` : ''}`
    : current
      ? `Sync running: ${current.name}.`
      : `Sync ${run.status}.`

  return (
    <section
      aria-label={`Sync progress for ${run.target_name}`}
      className={cn(
        'rounded-lg border bg-background p-4 shadow-xs',
        run.status === 'failed' ? 'border-danger/30' : run.status === 'succeeded' ? 'border-success/30' : 'border-border',
        className,
      )}
    >
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{terminal ? 'Sync finished' : 'Sync in progress'}</p>
          <RunStatusBadge status={run.status} />
          <SimulatedBadge label="Simulated run" reason="This run is simulated by the in-browser mock API. No data was extracted from the source." />
        </div>
        <div className="flex items-center gap-1">
          {!terminal ? (
            <GatedButton
              variant="ghost"
              size="sm"
              reason={canSync ? null : permissionReason('sources:sync')}
              loading={cancel.isPending}
              onClick={() =>
                cancel.mutate(run, {
                  onSuccess: () => toastInfo('Cancellation requested', 'The sync stops after the current step.'),
                  onError: (e) => toastError(e, 'Could not cancel the sync'),
                })
              }
            >
              Cancel
            </GatedButton>
          ) : null}
          <Button asChild variant="outline" size="sm">
            <Link to={wsPath(workspaceId, 'runs', run.id)}>
              Open run
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
          {onDismiss && terminal ? (
            <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss sync progress">
              <X className="size-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      <Progress
        value={pct}
        className="mt-3"
        aria-label="Sync progress"
        indicatorClassName={run.status === 'failed' ? 'bg-danger' : run.status === 'succeeded' ? 'bg-success' : 'bg-running'}
      />
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-3">
        {run.stages.map((stage) => (
          <StageItem key={stage.key} stage={stage} />
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          Records <span className="font-medium text-foreground tabular">{formatNumber(run.records_processed)}</span>
        </span>
        <span>
          Tables <span className="font-medium text-foreground tabular">{run.tables.filter((t) => t.status === 'succeeded').length}</span> / {run.tables.length}
        </span>
        <span>
          Elapsed <span className="font-medium text-foreground tabular">{formatDuration(run.duration_seconds)}</span>
        </span>
        <span className="font-mono">{run.id}</span>
      </div>
      {run.error ? (
        <p className="mt-3 rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-sm">
          <span className="font-mono text-xs text-muted-foreground">{run.error.code}</span> {run.error.message}
        </p>
      ) : null}
    </section>
  )
}
