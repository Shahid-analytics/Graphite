import { ClipboardList, FileChartColumn, LayoutDashboard, MessageSquarePlus, Sparkles, Star } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { CardsSkeleton, EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { SearchInput } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { toastError } from '@/lib/toast'
import type { AnalyticsListQuery, BusinessArea } from '@/types'
import { DashboardCard } from '../components/dashboard-card'
import { MetabaseStrip } from '../components/metabase-strip'
import { favoritesAndRecent, RecentList, type CatalogItem } from '../components/recent-list'
import { ReportsTable } from '../components/reports-table'
import { RequestReportDialog } from '../components/request-report-dialog'
import { RequestsList } from '../components/requests-list'
import { BUSINESS_AREAS, areaLabel } from '../lib/labels'
import { useDashboards, useFavoriteDashboard, useFavoriteReport, useReportRequests, useReports } from '../queries'

const TABS = ['recent', 'dashboards', 'reports', 'requests'] as const
type Tab = (typeof TABS)[number]

function TabCount({ value }: { value: number | undefined }) {
  if (value === undefined) return null
  return <span className="ml-1.5 rounded-sm bg-surface-2 px-1.5 text-[11px] tabular text-muted-foreground">{value}</span>
}

export default function AnalyticsPage() {
  const { workspaceId } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [requestOpen, setRequestOpen] = useState(false)
  const [search, setSearch] = useState('')
  const q = useDeferredValue(search.trim())

  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'recent'
  const areaParam = params.get('area')
  const area = BUSINESS_AREAS.some((a) => a.value === areaParam) ? (areaParam as BusinessArea) : null
  const favoritesOnly = params.get('favorites') === '1'

  const updateParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const listQuery: AnalyticsListQuery = { q: q || undefined, business_area: area ?? undefined, favorite: favoritesOnly || undefined }
  const dashboards = useDashboards(workspaceId, listQuery)
  const reports = useReports(workspaceId, listQuery)
  const requests = useReportRequests(workspaceId)
  const favoriteDashboard = useFavoriteDashboard(workspaceId)
  const favoriteReport = useFavoriteReport(workspaceId)

  const filtersActive = Boolean(q || area || favoritesOnly)
  const clearFilters = () => {
    setSearch('')
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('area')
        next.delete('favorites')
        return next
      },
      { replace: true },
    )
  }

  const filteredRequests = useMemo(() => {
    const needle = q.toLowerCase()
    return (requests.data ?? []).filter(
      (r) => (!area || r.business_area === area) && (!needle || `${r.title} ${r.description} ${r.requested_by.name}`.toLowerCase().includes(needle)),
    )
  }, [requests.data, area, q])

  const recentItems = useMemo(() => favoritesAndRecent(dashboards.data ?? [], reports.data ?? []), [dashboards.data, reports.data])

  const pendingFavoriteId = favoriteDashboard.isPending
    ? (favoriteDashboard.variables?.id ?? null)
    : favoriteReport.isPending
      ? (favoriteReport.variables?.id ?? null)
      : null

  const toggleDashboard = (id: string, isFavorite: boolean) =>
    favoriteDashboard.mutate({ id, isFavorite }, { onError: (error) => toastError(error, 'Could not update favorites') })
  const toggleReport = (id: string, isFavorite: boolean) =>
    favoriteReport.mutate({ id, isFavorite }, { onError: (error) => toastError(error, 'Could not update favorites') })
  const toggleEntry = (entry: CatalogItem, next: boolean) => (entry.kind === 'dashboard' ? toggleDashboard(entry.item.id, next) : toggleReport(entry.item.id, next))

  const assistantHref = wsPath(workspaceId, 'analytics', 'assistant')
  const settingsHref = wsPath(workspaceId, 'settings', 'metabase')
  const clearAction = (
    <Button variant="outline" size="sm" onClick={clearFilters}>
      Clear filters
    </Button>
  )
  const filterDescription = [area ? areaLabel(area) : null, favoritesOnly ? 'favorites' : null, q ? `"${q}"` : null].filter(Boolean).join(', ')

  return (
    <div>
      <PageHeader
        title="Analytics & Reports"
        description="Metabase dashboards and reports built on your Gold models, plus an assistant that drafts report definitions for review."
        actions={
          <>
            <Button variant="outline" onClick={() => setRequestOpen(true)}>
              <MessageSquarePlus aria-hidden />
              Request a custom report
            </Button>
            <Button asChild>
              <Link to={assistantHref}>
                <Sparkles aria-hidden />
                Describe a report
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-5">
        <MetabaseStrip workspaceId={workspaceId} settingsHref={settingsHref} />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ToggleGroup
              type="single"
              size="sm"
              value={area ?? 'all'}
              onValueChange={(value) => value && updateParam('area', value === 'all' ? null : value)}
              aria-label="Business area"
            >
              <ToggleGroupItem value="all">All</ToggleGroupItem>
              {BUSINESS_AREAS.map((a) => (
                <ToggleGroupItem key={a.value} value={a.value}>
                  {a.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput value={search} onChange={setSearch} placeholder="Search dashboards and reports" className="sm:w-72" />
            <div className="flex items-center gap-2">
              <Switch id="analytics-favorites" checked={favoritesOnly} onCheckedChange={(checked) => updateParam('favorites', checked ? '1' : null)} />
              <Label htmlFor="analytics-favorites" className="whitespace-nowrap font-normal">
                Favorites only
              </Label>
            </div>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(value) => updateParam('tab', value === 'recent' ? null : value)}>
          <div className="overflow-x-auto">
            <TabsList>
              <TabsTrigger value="recent">Favorites and recent</TabsTrigger>
              <TabsTrigger value="dashboards">
                Dashboards
                <TabCount value={dashboards.data?.length} />
              </TabsTrigger>
              <TabsTrigger value="reports">
                Reports
                <TabCount value={reports.data?.length} />
              </TabsTrigger>
              <TabsTrigger value="requests">
                Requests
                <TabCount value={requests.data ? filteredRequests.length : undefined} />
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="recent" className="mt-4">
            {dashboards.isPending || reports.isPending ? (
              <TableSkeleton rows={5} columns={3} />
            ) : dashboards.isError || reports.isError ? (
              <ErrorState
                error={dashboards.error ?? reports.error}
                onRetry={() => {
                  void dashboards.refetch()
                  void reports.refetch()
                }}
              />
            ) : recentItems.length ? (
              <RecentList workspaceId={workspaceId} items={recentItems} pendingFavoriteId={pendingFavoriteId} onFavorite={toggleEntry} />
            ) : filtersActive ? (
              <EmptyState icon={Star} title="Nothing matches these filters" description={`No favorite or recently viewed items for ${filterDescription}.`} action={clearAction} />
            ) : (
              <EmptyState
                icon={Star}
                title="No favorites or recent items yet"
                description="Star dashboards and reports to pin them here. Items you open also appear here."
                action={
                  <Button variant="outline" size="sm" onClick={() => updateParam('tab', 'dashboards')}>
                    Browse dashboards
                  </Button>
                }
              />
            )}
          </TabsContent>

          <TabsContent value="dashboards" className="mt-4">
            {dashboards.isPending ? (
              <CardsSkeleton count={6} className="sm:grid-cols-2 xl:grid-cols-3" />
            ) : dashboards.isError ? (
              <ErrorState error={dashboards.error} onRetry={() => void dashboards.refetch()} />
            ) : dashboards.data.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dashboards.data.map((dashboard) => (
                  <DashboardCard
                    key={dashboard.id}
                    workspaceId={workspaceId}
                    dashboard={dashboard}
                    favoritePending={pendingFavoriteId === dashboard.id}
                    onFavorite={(next) => toggleDashboard(dashboard.id, next)}
                  />
                ))}
              </div>
            ) : filtersActive ? (
              <EmptyState icon={LayoutDashboard} title="No dashboards match these filters" description={`Nothing found for ${filterDescription}.`} action={clearAction} />
            ) : (
              <EmptyState
                icon={LayoutDashboard}
                title="No dashboards yet"
                description="Dashboards are built in Metabase on top of your Gold models. Connect Metabase in Settings, then dashboards published there appear in this catalog."
                action={
                  <>
                    <Button asChild variant="outline" size="sm">
                      <Link to={settingsHref}>Metabase settings</Link>
                    </Button>
                    <Button asChild size="sm">
                      <Link to={assistantHref}>Describe a report</Link>
                    </Button>
                  </>
                }
              />
            )}
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            {reports.isPending ? (
              <TableSkeleton />
            ) : reports.isError ? (
              <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
            ) : (
              <ReportsTable
                workspaceId={workspaceId}
                reports={reports.data}
                pendingFavoriteId={pendingFavoriteId}
                onFavorite={(report, next) => toggleReport(report.id, next)}
                empty={
                  filtersActive ? (
                    <EmptyState icon={FileChartColumn} title="No reports match these filters" description={`Nothing found for ${filterDescription}.`} action={clearAction} />
                  ) : (
                    <EmptyState
                      icon={FileChartColumn}
                      title="No reports yet"
                      description="Describe the question you want answered and the assistant drafts a report definition from your Gold models for you to review."
                      action={
                        <Button asChild size="sm">
                          <Link to={assistantHref}>
                            <Sparkles aria-hidden />
                            Describe a report
                          </Link>
                        </Button>
                      }
                    />
                  )
                }
              />
            )}
          </TabsContent>

          <TabsContent value="requests" className="mt-4">
            {requests.isPending ? (
              <TableSkeleton rows={4} columns={3} />
            ) : requests.isError ? (
              <ErrorState error={requests.error} onRetry={() => void requests.refetch()} />
            ) : filteredRequests.length ? (
              <RequestsList requests={filteredRequests} />
            ) : requests.data.length ? (
              <EmptyState icon={ClipboardList} title="No requests match these filters" description={`Nothing found for ${filterDescription}.`} action={clearAction} />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="No custom report requests"
                description="Ask the data team for a report or dashboard the assistant cannot produce."
                action={
                  <Button size="sm" onClick={() => setRequestOpen(true)}>
                    Request a custom report
                  </Button>
                }
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      <RequestReportDialog key={area ?? 'all'} workspaceId={workspaceId} open={requestOpen} onOpenChange={setRequestOpen} defaultArea={area} />
    </div>
  )
}
