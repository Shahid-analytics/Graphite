import { CalendarClock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatRelative } from '@/lib/format'
import type { Schedule } from '@/types'
import { TARGET_META, formatTimeInZone, localTimezone, upcomingRuns } from '../lib/schedule-utils'

const COLLAPSED_LIMIT = 12

/** Horizontal, time-ordered list of every run the enabled schedules will trigger in the next 24 hours. */
export function UpcomingStrip({ schedules, isLoading }: { schedules: Schedule[] | undefined; isLoading: boolean }) {
  const { workspaceId } = useWorkspace()
  const [expanded, setExpanded] = useState(false)
  const upcoming = useMemo(() => upcomingRuns(schedules ?? [], 24), [schedules])
  const timezone = localTimezone()
  const visible = expanded ? upcoming : upcoming.slice(0, COLLAPSED_LIMIT)
  const hidden = upcoming.length - visible.length

  return (
    <section aria-labelledby="upcoming-heading" className="mb-6 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="upcoming-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
          Next 24 hours
          {!isLoading ? <span className="font-normal text-muted-foreground">· {upcoming.length} scheduled {upcoming.length === 1 ? 'run' : 'runs'}</span> : null}
        </h2>
        <p className="text-xs text-muted-foreground">Times in your local timezone ({timezone})</p>
      </div>

      {isLoading ? (
        <div className="flex gap-2 overflow-hidden" aria-busy="true" aria-label="Loading upcoming runs">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-40 shrink-0" />
          ))}
        </div>
      ) : upcoming.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No enabled schedule triggers a run in the next 24 hours.</p>
      ) : (
        <ol className="scrollbar-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Upcoming scheduled runs">
          {visible.map((item) => {
            const Icon = TARGET_META[item.schedule.target_type].icon
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  to={wsPath(workspaceId, 'schedules', item.schedule.id)}
                  className="flex w-44 flex-col gap-0.5 rounded-md border border-border bg-background px-2.5 py-2 hover:border-border-strong"
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <time dateTime={item.at.toISOString()} className="font-mono text-[13px] font-medium tabular">
                      {formatTimeInZone(item.at, timezone)}
                    </time>
                    <span className="truncate text-[11px] text-muted-foreground">{formatRelative(item.at)}</span>
                  </span>
                  <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                    <Icon className="size-3 shrink-0" aria-hidden />
                    <span className="truncate text-foreground">{item.schedule.name}</span>
                  </span>
                </Link>
              </li>
            )
          })}
          {hidden > 0 || expanded ? (
            <li className="flex shrink-0 items-center">
              <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                {expanded ? 'Show fewer' : `+${hidden} more`}
              </Button>
            </li>
          ) : null}
        </ol>
      )}
    </section>
  )
}
