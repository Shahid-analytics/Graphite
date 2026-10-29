import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatRelative } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Schedule } from '@/types'
import { formatInZone, localTimezone, nextOccurrences, zoneOffsetLabel } from '../lib/schedule-utils'

export function NextRunsCard({ schedule }: { schedule: Schedule }) {
  const runs = useMemo(() => nextOccurrences(schedule.cron, schedule.timezone, 5), [schedule.cron, schedule.timezone])
  const local = localTimezone()

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle>
          <h2 className="text-sm font-semibold">{schedule.enabled ? 'Next 5 runs' : 'Next 5 runs if enabled'}</h2>
        </CardTitle>
        <CardDescription className="text-xs">
          {schedule.timezone} ({zoneOffsetLabel(schedule.timezone)})
          {schedule.enabled ? '' : '. This schedule is disabled and will not trigger runs.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length ? (
          <ol className={cn('space-y-2', !schedule.enabled && 'opacity-60')}>
            {runs.map((date, index) => (
              <li key={date.getTime()} className="flex items-baseline gap-3">
                <span className="w-4 text-right text-xs text-subtle-foreground tabular">{index + 1}</span>
                <span className="min-w-0">
                  <time dateTime={date.toISOString()} className="block font-mono text-[13px] tabular">
                    {formatInZone(date, schedule.timezone)}
                  </time>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(date)}
                    {local !== schedule.timezone ? ` · ${formatInZone(date, local)} your time` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">The cron expression could not be evaluated in this browser. The backend scheduler remains authoritative.</p>
        )}
      </CardContent>
    </Card>
  )
}
