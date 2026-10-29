import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { Skeleton } from '@/components/ui/skeleton'
import { RunStatusBadge } from '@/components/status/status-badge'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useRun } from '@/components/runs/use-run'
import { wsPath } from '@/hooks/use-workspace'
import { formatDuration } from '@/lib/format'
import { cn } from '@/lib/utils'
import { isTerminal, type Run } from '@/types'
import { DBT_RUN_KIND_LABELS } from '../lib/labels'
import { invalidateAfterRun } from '../queries'

function progressOf(run: Run) {
  if (!run.stages.length) return 0
  const done = run.stages.filter((s) => s.status === 'succeeded' || s.status === 'skipped').length
  const running = run.stages.some((s) => s.status === 'running') ? 0.5 : 0
  return Math.round(((done + running) / run.stages.length) * 100)
}

function statusSentence(run: Run) {
  const command = DBT_RUN_KIND_LABELS[run.kind] ?? run.kind
  const stage = run.stages.find((s) => s.status === 'running')
  switch (run.status) {
    case 'queued':
      return `${command} is queued and waiting for a worker.`
    case 'running':
      return `${command} is running${stage ? `: ${stage.name}` : ''}.`
    case 'succeeded':
      return `${command} succeeded in ${formatDuration(run.duration_seconds)}.`
    case 'failed':
      return `${command} failed${run.error ? `: ${run.error.message}` : '.'}`
    case 'cancelled':
      return `${command} was cancelled.`
    default:
      return `${command} finished with status ${run.status}.`
  }
}

/** Live status of a run triggered from the model page. Polls until terminal, then refreshes related data once. */
export function ActiveRunPanel({ workspaceId, runId, onDismiss }: { workspaceId: string; runId: string; onDismiss: () => void }) {
  const queryClient = useQueryClient()
  const { data: run, isError } = useRun(runId)
  const settledFor = useRef<string | null>(null)
  const terminal = run ? isTerminal(run.status) : false

  useEffect(() => {
    if (terminal && settledFor.current !== runId) {
      settledFor.current = runId
      void invalidateAfterRun(queryClient)
    }
  }, [terminal, runId, queryClient])

  if (isError) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-4 py-3 text-sm shadow-xs" role="status">
        <span className="text-muted-foreground">Live status for run {runId} is unavailable.</span>
        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link to={wsPath(workspaceId, 'runs', runId)}>
              Open run
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss run status">
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        'rounded-lg border bg-background px-4 py-3 shadow-xs',
        run?.status === 'failed' ? 'border-danger/30' : run?.status === 'succeeded' ? 'border-success/30' : 'border-border',
      )}
    >
      {!run ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading run">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-1.5 w-full" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <RunStatusBadge status={run.status} />
            <span className="font-mono text-xs text-muted-foreground">{run.id}</span>
            <SimulatedBadge reason="This run is simulated by the in-browser mock API. No dbt command ran against a warehouse." />
            <div className="ml-auto flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link to={wsPath(workspaceId, 'runs', run.id)}>
                  View run log
                  <ArrowUpRight className="size-3.5" aria-hidden />
                </Link>
              </Button>
              {terminal ? (
                <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss run status">
                  <X className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-sm" aria-live="polite" role="status">
            {statusSentence(run)}
          </p>
          {!terminal ? (
            <Progress value={progressOf(run)} className="mt-2 h-1.5" aria-label="Run progress" />
          ) : run.error?.details ? (
            <p className="mt-1 text-xs text-muted-foreground">{run.error.details}</p>
          ) : null}
        </>
      )}
    </div>
  )
}
