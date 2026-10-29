import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { formatDuration } from '@/lib/format'
import { ErrorState } from '@/components/feedback/states'
import { RunStatusBadge, StatusDot } from '@/components/status/status-badge'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import { isTerminal, type Run } from '@/types'
import { proposalKeys } from '../queries'

const STAGE_TONE = { succeeded: 'success', failed: 'danger', running: 'running', queued: 'neutral', cancelled: 'neutral', skipped: 'neutral' } as const

/** Live progress of the schema_apply run for a proposal. Polls through the run query. */
export function ApplyProgress({ run, isLoading, error, onRetry, workspaceId }: { run: Run | undefined; isLoading: boolean; error: unknown; onRetry: () => void; workspaceId: string }) {
  const queryClient = useQueryClient()
  const settled = run ? isTerminal(run.status) : false
  const seenActive = useRef(false)

  // The backend moves the proposal to applied (or back to approved) when the run settles.
  useEffect(() => {
    if (!run) return
    if (!settled) seenActive.current = true
    else if (seenActive.current) {
      seenActive.current = false
      void queryClient.invalidateQueries({ queryKey: proposalKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['models'] })
    }
  }, [run, settled, queryClient])

  if (error) return <ErrorState compact error={error} title="Could not load the apply run" onRetry={onRetry} />
  if (isLoading || !run) {
    return (
      <div className="space-y-3 rounded-lg border border-border p-4" aria-busy="true" aria-label="Loading apply run">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    )
  }

  const done = run.stages.filter((s) => s.status === 'succeeded' || s.status === 'skipped').length
  const pct = run.stages.length ? Math.round((done / run.stages.length) * 100) : 0
  const current = run.stages.find((s) => s.status === 'running')

  return (
    <section aria-labelledby="apply-run-heading" className="space-y-3 rounded-lg border border-border bg-background p-4 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="apply-run-heading" className="text-sm font-semibold">
          Apply run
        </h2>
        <RunStatusBadge status={run.status} />
        <SimulatedBadge label="Simulated run" reason="This run is simulated by the in-browser mock API. No dbt command ran and no warehouse table was changed." />
        <Button asChild variant="ghost" size="sm" className="ml-auto">
          <Link to={wsPath(workspaceId, 'runs', run.id)}>
            View run
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      </div>
      <div aria-live="polite" className="space-y-2">
        <Progress value={settled && run.status === 'succeeded' ? 100 : pct} aria-label="Apply progress" indicatorClassName={cn(run.status === 'failed' && 'bg-danger')} />
        <p className="text-xs text-muted-foreground">
          {run.status === 'queued' && 'Queued. Waiting for a worker to pick up the dbt job.'}
          {run.status === 'running' && `${current?.name ?? 'Running'}: stage ${Math.min(done + 1, run.stages.length)} of ${run.stages.length}.`}
          {run.status === 'succeeded' && `Completed in ${formatDuration(run.duration_seconds)}. The proposal is now applied.`}
          {run.status === 'failed' && (run.error?.message ?? 'The run failed.')}
          {run.status === 'cancelled' && 'The run was cancelled. The proposal remains approved and can be applied again.'}
        </p>
      </div>
      <ol className="grid gap-1.5 sm:grid-cols-3">
        {run.stages.map((stage) => (
          <li key={stage.key} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
            <StatusDot tone={STAGE_TONE[stage.status]} pulse={stage.status === 'running'} />
            <span className="truncate">{stage.name}</span>
            <span className="ml-auto text-subtle-foreground tabular">{stage.duration_seconds !== null ? formatDuration(stage.duration_seconds) : ''}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
