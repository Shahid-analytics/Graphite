import { Activity, RefreshCw } from 'lucide-react'
import { TimeAgo } from '@/components/data/display'
import { Notice } from '@/components/feedback/notice'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { HealthIndicator } from '@/components/status/status-badge'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useWorkspace } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import type { HealthStatus, SystemComponentHealth } from '@/types'
import { useSystemHealth } from '../queries'

const OVERALL_COPY: Record<HealthStatus, string> = {
  healthy: 'All components are operating normally.',
  degraded: 'Some components are degraded. Runs may be slower or delayed.',
  unhealthy: 'At least one component is failing. Check the components below.',
  paused: 'Some components are paused.',
  unknown: 'The status of some components could not be determined.',
}

const SEVERITY: Record<HealthStatus, number> = { unhealthy: 0, degraded: 1, unknown: 2, paused: 3, healthy: 4 }

const columns: Column<SystemComponentHealth>[] = [
  { id: 'component', header: 'Component', sortValue: (c) => c.component, cell: (c) => <span className="font-medium">{c.component}</span> },
  { id: 'status', header: 'Status', sortValue: (c) => SEVERITY[c.status], cell: (c) => <HealthIndicator status={c.status} /> },
  {
    id: 'latency',
    header: 'Latency',
    hideOnMobile: true,
    sortValue: (c) => c.latency_ms,
    cell: (c) => <span className="tabular text-muted-foreground">{c.latency_ms === null ? '—' : `${c.latency_ms} ms`}</span>,
  },
  { id: 'message', header: 'Message', cell: (c) => <span className="block max-w-md text-sm whitespace-normal text-muted-foreground">{c.message ?? '—'}</span> },
  { id: 'checked', header: 'Checked', hideOnMobile: true, sortValue: (c) => c.checked_at, cell: (c) => (c.checked_at ? <TimeAgo value={c.checked_at} className="text-muted-foreground" /> : <span className="text-muted-foreground">Never</span>) },
]

export default function SystemHealthPage() {
  const { workspaceId } = useWorkspace()
  const health = useSystemHealth(workspaceId)
  const refreshing = health.isFetching && !health.isLoading

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          System health
          {isMockMode ? <SimulatedBadge reason="Produced by the mock API. It cannot observe backend services, so components without a matching setting report Unknown." /> : null}
        </span>
      }
      description="Backend components that ingestion, transformation and reporting depend on. Refreshes every minute."
      action={
        <Button variant="outline" size="sm" onClick={() => health.refetch()} loading={refreshing}>
          {refreshing ? null : <RefreshCw aria-hidden />}
          Refresh
        </Button>
      }
    >
      {health.isLoading ? (
        <TableSkeleton rows={7} columns={4} />
      ) : health.isError ? (
        <ErrorState error={health.error} onRetry={() => health.refetch()} />
      ) : health.data ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between" aria-live="polite">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-md border border-border bg-surface">
                  <Activity className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    Overall
                    <HealthIndicator status={health.data.overall} />
                  </p>
                  <p className="text-xs text-muted-foreground">{OVERALL_COPY[health.data.overall]}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Backend version <span className="font-mono text-foreground">{health.data.version}</span>
                {health.dataUpdatedAt ? (
                  <>
                    {' '}
                    · updated <TimeAgo value={new Date(health.dataUpdatedAt).toISOString()} />
                  </>
                ) : null}
              </p>
            </CardContent>
          </Card>
          {isMockMode ? (
            <Notice tone="neutral">
              No backend is connected. Warehouse, dbt, Metabase and AI provider rows reflect the saved settings; the API gateway, scheduler and worker queue
              cannot be observed and report Unknown.
            </Notice>
          ) : null}
          <DataTable
            columns={columns}
            rows={health.data.components}
            getRowId={(c) => c.component}
            caption="System components"
            empty={<EmptyState icon={Activity} title="No components reported" description="The backend did not report any components. Refresh to try again." action={
              <Button variant="outline" size="sm" onClick={() => health.refetch()}>
                Refresh
              </Button>
            } />}
          />
        </div>
      ) : null}
    </Section>
  )
}
