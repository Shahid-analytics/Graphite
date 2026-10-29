import { Progress } from '@/components/ui/progress'
import { formatDuration, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Run } from '@/types'
import { STAGE_META } from './labels'

/** Fraction of stages that are finished (succeeded or skipped), counting a running stage as half done. */
export function runProgress(run: Pick<Run, 'stages' | 'status'>) {
  if (!run.stages.length) return run.status === 'succeeded' ? 1 : 0
  const done = run.stages.filter((s) => s.status === 'succeeded' || s.status === 'skipped').length
  const running = run.stages.some((s) => s.status === 'running') ? 0.5 : 0
  return Math.min(1, (done + running) / run.stages.length)
}

/** Live progress for a queued or running run, announced politely to assistive technology. */
export function RunProgress({ run, className }: { run: Run; className?: string }) {
  const current = run.stages.find((s) => s.status === 'running')
  const pct = Math.round(runProgress(run) * 100)
  const position = current ? run.stages.indexOf(current) + 1 : 0
  const message =
    run.status === 'queued'
      ? 'Queued. Waiting for a worker.'
      : current
        ? `Stage ${position} of ${run.stages.length}: ${STAGE_META[current.key].name}`
        : 'Finishing up'
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <p role="status" aria-live="polite" className="font-medium">
          {message}
        </p>
        <p className="text-xs tabular text-muted-foreground">
          {pct}% · elapsed {formatDuration(run.duration_seconds ?? 0)}
          {run.records_processed ? ` · ${formatNumber(run.records_processed)} records so far` : ''}
        </p>
      </div>
      <Progress value={pct} aria-label="Run progress" indicatorClassName="bg-running" />
    </div>
  )
}
