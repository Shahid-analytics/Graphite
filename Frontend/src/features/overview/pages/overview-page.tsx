import { useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'
import { useState } from 'react'
import { TimeAgo } from '@/components/data/display'
import { ErrorState } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { PageHeader } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { useWorkspace, workspaceKeys } from '@/hooks/use-workspace'
import { errorMessage } from '@/services/api-error'
import { ActivityTrendCard } from '../components/activity-trend-card'
import { AuditEventsCard, RecentAnalyticsCard, TransformationActivityCard } from '../components/activity-cards'
import { FailedRunsCard } from '../components/failed-runs-card'
import { FreshnessCard } from '../components/freshness-card'
import { OnboardingChecklist, shouldShowOnboarding } from '../components/onboarding-checklist'
import { OverviewSkeleton } from '../components/overview-skeleton'
import { OverviewStats } from '../components/overview-stats'
import { QualityCard } from '../components/quality-card'
import { RecentRunsCard } from '../components/recent-runs-card'
import { UpcomingSchedulesCard } from '../components/upcoming-schedules-card'
import { useOverview } from '../queries'

export default function OverviewPage() {
  const { workspace, workspaceId } = useWorkspace()
  const queryClient = useQueryClient()
  const overview = useOverview(workspaceId)
  const { data } = overview

  // Tracks user-initiated refreshes only, so background polling does not flicker the button.
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([overview.refetch(), queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) })])
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Overview"
        meta={<SimulatedBadge label="Simulated data" reason="Every figure on this page comes from the in-browser demo dataset. No source, warehouse or Metabase instance was queried." />}
        description={
          <>
            Health of ingestion, transformations and analytics for {workspace.name}.
            {data ? (
              <>
                {' '}
                Updated <TimeAgo value={data.generated_at} />.
              </>
            ) : null}
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void refresh()} loading={refreshing} disabled={overview.isLoading}>
            {refreshing ? null : <RotateCw aria-hidden />}
            Refresh
          </Button>
        }
      />

      {shouldShowOnboarding(workspace) ? <OnboardingChecklist workspace={workspace} /> : null}

      {overview.isLoading ? (
        <OverviewSkeleton />
      ) : !data ? (
        <ErrorState error={overview.error} title="Could not load the overview" onRetry={() => void overview.refetch()} />
      ) : (
        <div className="space-y-4">
          {overview.isRefetchError ? (
            <Notice tone="warning" title="Could not refresh the overview">
              {errorMessage(overview.error)} Showing data from the last successful load.
            </Notice>
          ) : null}

          <OverviewStats data={data} workspaceId={workspaceId} />

          <div className="grid gap-4 lg:grid-cols-3">
            <ActivityTrendCard trend={data.run_trend} hasSources={data.sources.total > 0} workspaceId={workspaceId} className="lg:col-span-2" />
            <QualityCard quality={data.quality} workspaceId={workspaceId} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <RecentRunsCard runs={data.recent_runs} workspaceId={workspaceId} className="lg:col-span-2" />
            <FailedRunsCard runs={data.failed_runs} workspaceId={workspaceId} />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FreshnessCard freshness={data.freshness} workspaceId={workspaceId} />
            <UpcomingSchedulesCard schedules={data.upcoming_schedules} workspaceId={workspaceId} />
            <TransformationActivityCard runs={data.recent_transformation_runs} workspaceId={workspaceId} className="md:col-span-2 xl:col-span-1" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RecentAnalyticsCard items={data.recent_analytics} workspaceId={workspaceId} />
            <AuditEventsCard events={data.latest_audit_events} workspaceId={workspaceId} />
          </div>
        </div>
      )}
    </div>
  )
}
