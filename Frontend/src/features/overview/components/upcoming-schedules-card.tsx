import { CalendarClock } from 'lucide-react'
import { EmptyState } from '@/components/feedback/states'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { wsPath } from '@/hooks/use-workspace'
import { formatDateTime, formatRelative } from '@/lib/format'
import type { UpcomingSchedule } from '@/types'
import { SCHEDULE_TARGET_LABELS } from './labels'
import { CardLink, CtaLink, MetaDot, OverviewCard, PanelList, PanelRow, RowLink } from './overview-card'

export function UpcomingSchedulesCard({ schedules, workspaceId, className }: { schedules: UpcomingSchedule[]; workspaceId: string; className?: string }) {
  return (
    <OverviewCard
      title="Upcoming scheduled jobs"
      description="Enabled schedules, next run first."
      className={className}
      action={<CardLink to={wsPath(workspaceId, 'schedules')}>All schedules</CardLink>}
    >
      {schedules.length ? (
        <PanelList label="Upcoming scheduled jobs">
          {schedules.map((schedule) => (
            <PanelRow
              key={schedule.id}
              leading={<CalendarClock className="size-4 text-subtle-foreground" aria-hidden />}
              title={
                <RowLink to={wsPath(workspaceId, 'schedules', schedule.id)} className="block truncate">
                  {schedule.name}
                </RowLink>
              }
              meta={
                <>
                  {SCHEDULE_TARGET_LABELS[schedule.target_type]}
                  <MetaDot />
                  <span className="truncate">{schedule.target_name}</span>
                </>
              }
              trailing={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <time dateTime={schedule.next_run_at} tabIndex={0} className="whitespace-nowrap font-medium text-foreground">
                      {formatRelative(schedule.next_run_at)}
                    </time>
                  </TooltipTrigger>
                  <TooltipContent>Next run {formatDateTime(schedule.next_run_at)}</TooltipContent>
                </Tooltip>
              }
            />
          ))}
        </PanelList>
      ) : (
        <EmptyState
          compact
          icon={CalendarClock}
          title="Nothing scheduled"
          description="Schedule syncs, pipelines and dbt runs so the warehouse stays fresh without manual runs."
          action={
            <CtaLink to={wsPath(workspaceId, 'schedules', 'new')} permission="schedules:write" deniedReason="Creating schedules requires the editor or admin role.">
              Create a schedule
            </CtaLink>
          }
        />
      )}
    </OverviewCard>
  )
}
