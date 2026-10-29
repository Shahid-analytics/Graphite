import { FileText, GitBranch, History, LayoutDashboard } from 'lucide-react'
import { TimeAgo } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { RunStatusBadge } from '@/components/status/status-badge'
import { Badge } from '@/components/ui/badge'
import { wsPath } from '@/hooks/use-workspace'
import { formatDuration } from '@/lib/format'
import { resourcePath } from '@/lib/resource-links'
import { isTerminal, type AuditEvent, type RecentAnalyticsItem, type RunSummary } from '@/types'
import { businessAreaLabel, humanizeAction, RUN_KIND_LABELS } from './labels'
import { CardLink, CtaLink, MetaDot, OverviewCard, PanelList, PanelRow, RowLink } from './overview-card'

export function TransformationActivityCard({ runs, workspaceId, className }: { runs: RunSummary[]; workspaceId: string; className?: string }) {
  return (
    <OverviewCard
      title="Recent transformation activity"
      help="dbt runs build Silver and Gold models from Bronze tables; dbt tests run the data quality checks defined on those models."
      className={className}
      action={<CardLink to={wsPath(workspaceId, 'transformations')}>Transformations</CardLink>}
    >
      {runs.length ? (
        <PanelList label="Recent transformation runs">
          {runs.map((run) => (
            <PanelRow
              key={run.id}
              title={
                <RowLink to={wsPath(workspaceId, 'runs', run.id)} className="block truncate">
                  {run.target_name}
                </RowLink>
              }
              meta={
                <>
                  {RUN_KIND_LABELS[run.kind]}
                  <MetaDot />
                  <TimeAgo value={run.started_at ?? run.queued_at} />
                  {isTerminal(run.status) && run.duration_seconds !== null ? (
                    <>
                      <MetaDot />
                      <span className="tabular">{formatDuration(run.duration_seconds)}</span>
                    </>
                  ) : null}
                </>
              }
              trailing={<RunStatusBadge status={run.status} />}
            />
          ))}
        </PanelList>
      ) : (
        <EmptyState
          compact
          icon={GitBranch}
          title="No dbt activity yet"
          description="dbt runs and tests appear here once a transformation project is connected."
          action={
            <CtaLink to={wsPath(workspaceId, 'transformations')} permission="transformations:write" deniedReason="Defining transformations requires the editor or admin role.">
              Set up transformations
            </CtaLink>
          }
        />
      )}
    </OverviewCard>
  )
}

export function RecentAnalyticsCard({ items, workspaceId, className }: { items: RecentAnalyticsItem[]; workspaceId: string; className?: string }) {
  return (
    <OverviewCard
      title="Recently accessed"
      description="Dashboards and reports opened most recently."
      className={className}
      action={<CardLink to={wsPath(workspaceId, 'analytics')}>Analytics</CardLink>}
    >
      {items.length ? (
        <PanelList label="Recently accessed dashboards and reports">
          {items.map((item) => {
            const Icon = item.kind === 'dashboard' ? LayoutDashboard : FileText
            return (
              <PanelRow
                key={`${item.kind}-${item.id}`}
                leading={<Icon className="size-4 text-subtle-foreground" aria-hidden />}
                title={
                  <RowLink to={wsPath(workspaceId, 'analytics', item.kind === 'dashboard' ? 'dashboards' : 'reports', item.id)} className="block truncate">
                    {item.name}
                  </RowLink>
                }
                meta={
                  <>
                    {item.kind === 'dashboard' ? 'Dashboard' : 'Report'}
                    <MetaDot />
                    {businessAreaLabel(item.business_area)}
                  </>
                }
                trailing={<TimeAgo value={item.accessed_at} />}
              />
            )
          })}
        </PanelList>
      ) : (
        <EmptyState
          compact
          icon={LayoutDashboard}
          title="No dashboards or reports opened yet"
          description="Reports built on Gold models and Metabase dashboards you open are listed here."
          action={<CtaLink to={wsPath(workspaceId, 'analytics')}>Open analytics</CtaLink>}
        />
      )}
    </OverviewCard>
  )
}

const AUDIT_STATUS: Record<AuditEvent['status'], { label: string; variant: 'danger' | 'warning' } | null> = {
  success: null,
  failure: { label: 'Failed', variant: 'danger' },
  denied: { label: 'Denied', variant: 'warning' },
}

const ACTOR_TYPE: Record<AuditEvent['actor']['type'], string> = { user: 'user', scheduler: 'scheduler', service: 'service', api_key: 'API key' }

export function AuditEventsCard({ events, workspaceId, className }: { events: AuditEvent[]; workspaceId: string; className?: string }) {
  return (
    <OverviewCard
      title="Latest audit events"
      description="Configuration changes and actions in this workspace."
      className={className}
      action={<CardLink to={wsPath(workspaceId, 'audit')}>Audit trail</CardLink>}
    >
      {events.length ? (
        <PanelList label="Latest audit events">
          {events.map((event) => {
            const status = AUDIT_STATUS[event.status]
            const to = resourcePath(workspaceId, event.resource.type, event.resource.id)
            return (
              <PanelRow
                key={event.id}
                title={to ? <RowLink to={to} className="block truncate">{event.resource.name}</RowLink> : <span className="block truncate">{event.resource.name}</span>}
                meta={
                  <>
                    <span>{humanizeAction(event.action)}</span>
                    <MetaDot />
                    <span className="truncate">
                      {event.actor.type === 'user' ? event.actor.name : `${event.actor.name} (${ACTOR_TYPE[event.actor.type]})`}
                    </span>
                  </>
                }
                trailing={
                  <>
                    <TimeAgo value={event.occurred_at} />
                    {status ? <Badge variant={status.variant}>{status.label}</Badge> : null}
                  </>
                }
              />
            )
          })}
        </PanelList>
      ) : (
        <EmptyState
          compact
          icon={History}
          title="No audit events yet"
          description="Every configuration change, run trigger and approval in this workspace is recorded in the audit trail."
          action={<CtaLink to={wsPath(workspaceId, 'audit')}>Open audit trail</CtaLink>}
        />
      )}
    </OverviewCard>
  )
}
