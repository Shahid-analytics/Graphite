import { ArrowRight, Bot, CalendarClock, ChartColumn, Database, GitBranch, Mail, Plug, RefreshCw, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { CardsSkeleton, EmptyState, ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { HealthIndicator } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import type { IntegrationStatus } from '@/types'
import type { SettingsSectionKey } from '../lib/sections'
import { useIntegrations } from '../queries'

const META: Record<IntegrationStatus['key'], { icon: LucideIcon; section: SettingsSectionKey; linkLabel: string; backendManaged?: boolean }> = {
  warehouse: { icon: Database, section: 'connections', linkLabel: 'Warehouse settings' },
  dbt: { icon: GitBranch, section: 'dbt', linkLabel: 'dbt settings' },
  metabase: { icon: ChartColumn, section: 'metabase', linkLabel: 'Metabase settings' },
  ai_provider: { icon: Bot, section: 'ai', linkLabel: 'AI provider settings' },
  email: { icon: Mail, section: 'notifications', linkLabel: 'Your notification preferences', backendManaged: true },
  scheduler: { icon: CalendarClock, section: 'scheduler', linkLabel: 'Scheduler defaults', backendManaged: true },
}

export default function IntegrationsSettingsPage() {
  const { workspaceId } = useWorkspace()
  const integrations = useIntegrations(workspaceId)

  return (
    <Section
      title={
        <span className="inline-flex items-center gap-2">
          Integrations
          {isMockMode ? <SimulatedBadge reason="Status is derived from the saved settings by the mock API. No external system was contacted." /> : null}
        </span>
      }
      description="Status of the systems Graphite depends on. Configure each one in its own section."
      action={
        <Button variant="outline" size="sm" onClick={() => integrations.refetch()} loading={integrations.isFetching && !integrations.isLoading}>
          {integrations.isFetching ? null : <RefreshCw aria-hidden />}
          Refresh
        </Button>
      }
    >
      {integrations.isLoading ? (
        <CardsSkeleton count={6} className="xl:grid-cols-2" />
      ) : integrations.isError ? (
        <ErrorState error={integrations.error} onRetry={() => integrations.refetch()} />
      ) : !integrations.data?.length ? (
        <EmptyState
          icon={Plug}
          title="No integrations reported"
          description="The backend did not report any integrations for this workspace. Start with the warehouse connection."
          action={
            <Button asChild size="sm">
              <Link to={wsPath(workspaceId, 'settings', 'connections')}>Configure the warehouse</Link>
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-live="polite">
          {integrations.data.map((item) => {
            const meta = META[item.key]
            const Icon = meta?.icon ?? Plug
            return (
              <li key={item.key}>
                <Card className="h-full">
                  <CardContent className="flex flex-1 flex-col gap-3 pt-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
                          <Icon className="size-4 text-muted-foreground" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.name}</p>
                          <HealthIndicator status={item.status} className="text-xs text-muted-foreground" />
                        </div>
                      </div>
                      {item.configured ? (
                        <Badge variant="outline">Configured</Badge>
                      ) : meta?.backendManaged ? (
                        <Badge variant="default">Backend managed</Badge>
                      ) : (
                        <Badge variant="warning">Not configured</Badge>
                      )}
                    </div>
                    {item.message ? <p className="text-sm break-words text-muted-foreground">{item.message}</p> : null}
                    <p className="mt-auto text-xs text-subtle-foreground">
                      Last checked {item.last_checked_at ? <TimeAgo value={item.last_checked_at} /> : 'never'}
                    </p>
                  </CardContent>
                  {meta ? (
                    <CardFooter className="py-2">
                      <Button asChild variant="link" size="sm" className="text-xs">
                        <Link to={wsPath(workspaceId, 'settings', meta.section)}>
                          {meta.linkLabel}
                          <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </Button>
                    </CardFooter>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}
