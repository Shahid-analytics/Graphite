import { Activity } from 'lucide-react'
import { EmptyState } from '@/components/feedback/states'
import { wsPath } from '@/hooks/use-workspace'
import type { Overview } from '@/types'
import { CardLink, CtaLink, OverviewCard } from './overview-card'
import { RunActivityChart } from './run-activity-chart'

export function ActivityTrendCard({
  trend,
  hasSources,
  workspaceId,
  className,
}: {
  trend: Overview['run_trend']
  hasSources: boolean
  workspaceId: string
  className?: string
}) {
  const hasRuns = trend.some((d) => d.succeeded + d.failed > 0)
  return (
    <OverviewCard
      title="Run activity"
      description="Completed pipeline runs and source syncs per day, last 14 days."
      help="Counts finished runs by the day they were queued, in the workspace timezone. Runs still in progress and dbt runs are not included."
      className={className}
      action={hasRuns ? <CardLink to={wsPath(workspaceId, 'pipelines')}>Pipelines</CardLink> : undefined}
    >
      {hasRuns ? (
        <RunActivityChart trend={trend} />
      ) : hasSources ? (
        <EmptyState
          compact
          icon={Activity}
          title="No completed runs in the last 14 days"
          description="Trigger a sync or a pipeline run, or add a schedule, to start building run history."
          action={<CtaLink to={wsPath(workspaceId, 'pipelines')}>Open pipelines</CtaLink>}
        />
      ) : (
        <EmptyState
          compact
          icon={Activity}
          title="No run history yet"
          description="Connect a data source and run the first ingestion. Daily succeeded and failed runs will chart here."
          action={
            <CtaLink to={wsPath(workspaceId, 'sources', 'new')} variant="default" permission="sources:write" deniedReason="Connecting sources requires the admin or owner role.">
              Connect a data source
            </CtaLink>
          }
        />
      )}
    </OverviewCard>
  )
}
