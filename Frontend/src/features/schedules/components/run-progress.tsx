import { ArrowRight, X } from 'lucide-react'
import { Link } from 'react-router'
import { useRun } from '@/components/runs/use-run'
import { SimulatedBadge } from '@/components/status/simulated'
import { RunStatusBadge, StatusDot } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDuration } from '@/lib/format'
import { errorMessage } from '@/services/api-error'
import { isTerminal, type RunStatus } from '@/types'

const STAGE_TONE: Record<RunStatus, 'success' | 'danger' | 'running' | 'neutral' | 'warning'> = {
  queued: 'neutral',
  running: 'running',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'warning',
  skipped: 'neutral',
}

/** Live progress of a run started with "Run now". Polls until the run is terminal. */
export function RunProgress({ runId, onDismiss }: { runId: string; onDismiss: () => void }) {
  const { workspaceId } = useWorkspace()
  const { data: run, isLoading, error } = useRun(runId)

  return (
    <Card className="mb-5">
      <CardContent className="space-y-3" aria-live="polite" aria-busy={run ? !isTerminal(run.status) : true}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Run now</h2>
            {run ? <RunStatusBadge status={run.status} /> : null}
            <SimulatedBadge reason="This run is simulated by the in-browser mock API. No source, warehouse, dbt project or Metabase instance was contacted." />
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" asChild>
              <Link to={wsPath(workspaceId, 'runs', runId)}>
                View run and logs
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            {run && isTerminal(run.status) ? (
              <Button variant="ghost" size="icon-sm" onClick={onDismiss} aria-label="Dismiss run progress">
                <X aria-hidden />
              </Button>
            ) : null}
          </div>
        </div>

        {isLoading ? <Skeleton className="h-10 w-full" /> : null}
        {error ? <p className="text-sm text-danger">{errorMessage(error)}</p> : null}
        {run ? (
          <>
            <Progress
              value={run.stages.filter((s) => isTerminal(s.status)).length}
              max={Math.max(1, run.stages.length)}
              aria-label="Run progress"
              indicatorClassName={run.status === 'failed' ? 'bg-danger' : run.status === 'succeeded' ? 'bg-success' : undefined}
            />
            <ol className="flex flex-wrap gap-x-4 gap-y-1">
              {run.stages.map((stage) => (
                <li key={stage.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusDot tone={STAGE_TONE[stage.status]} pulse={stage.status === 'running'} />
                  <span className={stage.status === 'running' ? 'text-foreground' : undefined}>{stage.name}</span>
                  <span className="sr-only">: {stage.status}</span>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted-foreground">
              Run <span className="font-mono">{run.id}</span> · {run.target_name}
              {run.duration_seconds !== null ? ` · ${formatDuration(run.duration_seconds)}` : ''}
              {run.records_processed !== null ? ` · ${run.records_processed.toLocaleString('en')} records` : ''}
            </p>
            {run.status === 'failed' && run.error ? (
              <p className="text-sm text-danger">
                {run.error.stage ? `${run.stages.find((s) => s.key === run.error?.stage)?.name ?? run.error.stage}: ` : ''}
                {run.error.message}
              </p>
            ) : null}
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
