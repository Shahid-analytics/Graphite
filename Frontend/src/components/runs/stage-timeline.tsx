import { formatDuration, formatNumber, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { RunStage } from '@/types'
import { metricLabel, STAGE_META } from './labels'
import { STAGE_STATUS_META, StageStatusIcon } from './stage-status'

/** Vertical stage list with timestamps, durations, metrics and inline errors. */
export function StageTimeline({ stages, className }: { stages: RunStage[]; className?: string }) {
  if (!stages.length) return <p className="text-sm text-muted-foreground">This run has no stages.</p>
  return (
    <ol aria-label="Stage timeline" className={cn('relative', className)}>
      {stages.map((stage, index) => {
        const meta = STAGE_META[stage.key]
        const status = STAGE_STATUS_META[stage.status]
        const metrics = Object.entries(stage.metrics ?? {})
        const last = index === stages.length - 1
        return (
          <li key={stage.key} className="relative flex gap-3 pb-4 last:pb-0">
            {!last ? <span className="absolute top-6 bottom-0 left-[11px] w-px bg-border" aria-hidden /> : null}
            <span className={cn('relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background', status.boxClass)}>
              <StageStatusIcon status={stage.status} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium">
                  {stage.name || meta.name}
                  <span className={cn('ml-2 text-xs font-normal', stage.status === 'failed' ? 'text-danger' : stage.status === 'running' ? 'text-running' : 'text-muted-foreground')}>
                    {status.label}
                  </span>
                </p>
                <p className="text-xs tabular text-muted-foreground">
                  {stage.started_at ? (
                    <>
                      <time dateTime={stage.started_at}>{formatTime(stage.started_at)}</time>
                      {stage.finished_at ? (
                        <>
                          {' to '}
                          <time dateTime={stage.finished_at}>{formatTime(stage.finished_at)}</time>
                        </>
                      ) : null}
                      {stage.duration_seconds !== null ? <span className="ml-2 text-foreground">{formatDuration(stage.duration_seconds)}</span> : null}
                    </>
                  ) : stage.status === 'skipped' ? (
                    'Not executed'
                  ) : stage.status === 'queued' ? (
                    'Waiting'
                  ) : null}
                </p>
              </div>
              {stage.status === 'skipped' && stage.skip_reason ? <p className="mt-0.5 text-xs text-muted-foreground">{stage.skip_reason}</p> : null}
              {metrics.length ? (
                <dl className="mt-1.5 flex flex-wrap gap-1.5">
                  {metrics.map(([key, value]) => (
                    <div key={key} className="inline-flex items-center gap-1 rounded-sm border border-border bg-surface px-1.5 py-0.5 text-[11px]">
                      <dt className="text-muted-foreground">{metricLabel(key)}</dt>
                      <dd className="tabular font-medium">{formatNumber(value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {stage.error ? (
                <div className="mt-2 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm">
                  <p className="font-mono text-xs text-danger">{stage.error.code}</p>
                  <p className="mt-0.5 text-foreground">{stage.error.message}</p>
                  {stage.error.details ? <p className="mt-1 text-xs whitespace-pre-wrap text-muted-foreground">{stage.error.details}</p> : null}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
