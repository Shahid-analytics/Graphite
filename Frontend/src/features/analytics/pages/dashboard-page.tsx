import { ExternalLink, LayoutDashboard } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { KeyValueGrid, TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { PageHeader, Section } from '@/components/layout/page-header'
import { MetabaseEmbed } from '@/components/metabase/metabase-embed'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatNumber } from '@/lib/format'
import { toastError } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import { reportsService } from '@/services/reports.service'
import { DashboardStatusBadge } from '../components/badges'
import { DashboardPreviewPanel } from '../components/dashboard-preview'
import { DatasetLink } from '../components/dataset-link'
import { FavoriteToggle } from '../components/favorite-toggle'
import { WithReason } from '../components/with-reason'
import { areaLabel } from '../lib/labels'
import { analyticsKeys, useDashboard, useFavoriteDashboard, useMetabaseStatus, useTestMetabase } from '../queries'

export default function DashboardPage() {
  const { dashboardId = '' } = useParams()
  const { workspaceId } = useWorkspace()
  const dashboard = useDashboard(dashboardId)
  const metabase = useMetabaseStatus(workspaceId)
  const testMetabase = useTestMetabase(workspaceId)
  const favorite = useFavoriteDashboard(workspaceId)

  const catalogHref = `${wsPath(workspaceId, 'analytics')}?tab=dashboards`
  const settingsHref = wsPath(workspaceId, 'settings', 'metabase')
  const crumbs = [{ label: 'Analytics & Reports', to: catalogHref }]

  if (dashboard.isPending) return <PageSkeleton />
  if (dashboard.isError) {
    if (isApiError(dashboard.error) && dashboard.error.status === 404) {
      return (
        <div>
          <PageHeader title="Dashboard not found" breadcrumbs={[...crumbs, { label: 'Not found' }]} />
          <EmptyState
            icon={LayoutDashboard}
            title="This dashboard does not exist"
            description="It may have been removed from Metabase or belong to another workspace."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={catalogHref}>Back to dashboards</Link>
              </Button>
            }
          />
        </div>
      )
    }
    return (
      <div>
        <PageHeader title="Dashboard" breadcrumbs={[...crumbs, { label: 'Dashboard' }]} />
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      </div>
    )
  }

  const d = dashboard.data
  if (d.workspace_id !== workspaceId) {
    return (
      <div>
        <PageHeader title="Dashboard not found" breadcrumbs={[...crumbs, { label: 'Not found' }]} />
        <EmptyState icon={LayoutDashboard} title="This dashboard belongs to another workspace" action={<Button asChild variant="outline" size="sm"><Link to={catalogHref}>Back to dashboards</Link></Button>} />
      </div>
    )
  }

  // Only link out when the backend reports Metabase as connected; an unreachable instance would be a dead link.
  const connected = metabase.data?.status === 'connected'
  const siteUrl = connected ? (metabase.data?.site_url ?? null) : null
  const metabaseHref = siteUrl && d.metabase_dashboard_id !== null ? `${siteUrl.replace(/\/$/, '')}/dashboard/${d.metabase_dashboard_id}` : null
  const openReason = metabaseHref
    ? null
    : d.metabase_dashboard_id === null
      ? 'This dashboard is a draft and has not been published to Metabase yet.'
      : metabase.isPending
        ? 'Checking the Metabase integration.'
        : metabase.isError
          ? 'The Metabase integration status could not be loaded, so the site URL is unknown.'
          : metabase.data?.site_url
            ? 'Metabase is not connected, so this dashboard cannot be opened there. Check the integration in Metabase settings.'
            : 'The Metabase site URL is not configured for this workspace.'

  return (
    <div>
      <PageHeader
        breadcrumbs={[...crumbs, { label: d.name }]}
        title={d.name}
        meta={
          <>
            <Badge variant="outline">{areaLabel(d.business_area)}</Badge>
            <DashboardStatusBadge status={d.status} />
          </>
        }
        description={d.description}
        actions={
          <>
            <FavoriteToggle
              size="icon"
              className="border border-input"
              name={d.name}
              isFavorite={d.is_favorite}
              pending={favorite.isPending}
              onToggle={(next) => favorite.mutate({ id: d.id, isFavorite: next }, { onError: (error) => toastError(error, 'Could not update favorites') })}
            />
            <WithReason reason={openReason}>
              {metabaseHref ? (
                <Button asChild variant="outline">
                  <a href={metabaseHref} target="_blank" rel="noopener noreferrer">
                    <ExternalLink aria-hidden />
                    Open in Metabase
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  <ExternalLink aria-hidden />
                  Open in Metabase
                </Button>
              )}
            </WithReason>
          </>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Section title="Dashboard" description="Embedded from Metabase with a short-lived URL signed by the backend.">
          <MetabaseEmbed
            title={`${d.name} (Metabase dashboard)`}
            status={metabase.data}
            statusLoading={metabase.isPending}
            statusError={metabase.error}
            requestEmbed={() => reportsService.embedSession(d.id)}
            embedKey={analyticsKeys.embed(d.id)}
            settingsHref={settingsHref}
            onCheckAgain={() => testMetabase.mutate(undefined, { onError: (error) => toastError(error, 'Connection test failed') })}
            checking={testMetabase.isPending}
          />
        </Section>

        <aside className="space-y-6">
          <Section title="Details">
            <KeyValueGrid
              columns={1}
              items={[
                { label: 'Owner', value: d.owner },
                { label: 'Updated', value: <TimeAgo value={d.updated_at} /> },
                { label: 'Cards', value: formatNumber(d.cards_count) },
                { label: 'Views (30 days)', value: formatNumber(d.view_count_30d) },
                { label: 'Metabase dashboard id', value: d.metabase_dashboard_id ?? 'Not published', mono: d.metabase_dashboard_id !== null },
              ]}
            />
          </Section>

          <Section title="Datasets" description="Models this dashboard reads.">
            {d.datasets.length ? (
              <ul className="space-y-2">
                {d.datasets.map((dataset) => (
                  <li key={dataset.model_id}>
                    <DatasetLink workspaceId={workspaceId} dataset={dataset} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No datasets are recorded for this dashboard.</p>
            )}
          </Section>

          {d.preview ? (
            <Section title="Preview" description="Headline values computed by the backend for the catalog.">
              <DashboardPreviewPanel preview={d.preview} className="rounded-lg border border-border bg-background p-4" />
            </Section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
