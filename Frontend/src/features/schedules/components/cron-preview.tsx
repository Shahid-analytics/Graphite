import { AlertCircle, CalendarClock } from 'lucide-react'
import { formatRelative } from '@/lib/format'
import type { CronValidation } from '@/lib/cron'
import { cn } from '@/lib/utils'
import { formatInZone, localTimezone, zoneOffsetLabel } from '../lib/schedule-utils'

/** Human description and the next run times of a cron expression in its timezone. */
export function CronPreview({ validation, timezone, className, id }: { validation: CronValidation; timezone: string; className?: string; id?: string }) {
  const local = localTimezone()
  const showLocal = local !== timezone

  if (!validation.valid) {
    return (
      <div id={id} className={cn('flex items-start gap-2 rounded-md border border-danger/25 bg-danger-soft px-3 py-2 text-sm', className)} aria-live="polite">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <span>{validation.error ?? 'Invalid cron expression.'}</span>
      </div>
    )
  }

  return (
    <div id={id} className={cn('rounded-md border border-border bg-surface px-3 py-2.5', className)} aria-live="polite">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
        {validation.description}
        <span className="font-normal text-muted-foreground">
          ({timezone}, {zoneOffsetLabel(timezone)})
        </span>
      </p>
      {validation.minIntervalMinutes !== null && validation.minIntervalMinutes < 15 ? (
        <p className="mt-1 text-xs text-warning">
          Runs start every {Math.round(validation.minIntervalMinutes)} minutes or less. Most pipelines take longer than that; check the overlap policy.
        </p>
      ) : null}
      <p className="mt-2 text-xs font-medium text-muted-foreground">Next {validation.nextRuns.length} runs</p>
      <ol className="mt-1 space-y-0.5">
        {validation.nextRuns.map((date) => (
          <li key={date.getTime()} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <time dateTime={date.toISOString()} className="font-mono text-[13px] tabular">
              {formatInZone(date, timezone)}
            </time>
            <span className="text-xs text-muted-foreground">{formatRelative(date)}</span>
            {showLocal ? <span className="text-xs text-subtle-foreground">({formatInZone(date, local)} your time)</span> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}
