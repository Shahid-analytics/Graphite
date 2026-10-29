import { Database, LayoutGrid, Plus } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { HelpTip, StatTile } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { FilterSelect, SearchInput, TableToolbar } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatCompact } from '@/lib/format'
import type { ConnectorType, HealthStatus, SourceListQuery, SourceStatus } from '@/types'
import { ConnectionsTable } from '../components/connections-table'
import { ConnectorCatalog } from '../components/connector-catalog'
import { GatedButton, permissionReason } from '../components/primitives'
import { useSourceActions } from '../components/source-actions'
import { SyncProgress } from '../components/sync-progress'
import { BRONZE_HELP, HEALTH_OPTIONS, STATUS_OPTIONS } from '../lib/labels'
import { useConnectors, useSources } from '../queries'

type Tab = 'connections' | 'catalog'

function AddSourceButton() {
  const { workspaceId } = useWorkspace()
  const canWrite = usePermission('sources:write')
  if (!canWrite) {
    return (
      <GatedButton reason={permissionReason('sources:write')}>
        <Plus className="size-4" aria-hidden />
        Add source
      </GatedButton>
    )
  }
  return (
    <Button asChild>
      <Link to={wsPath(workspaceId, 'sources', 'new')}>
        <Plus className="size-4" aria-hidden />
        Add source
      </Link>
    </Button>
  )
}

export default function SourcesPage() {
  const { workspaceId } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'catalog' ? 'catalog' : 'connections'
  const [search, setSearch] = useState('')
  const [connector, setConnector] = useState('all')
  const [status, setStatus] = useState('all')
  const [health, setHealth] = useState('all')
  const [trackedRuns, setTrackedRuns] = useState<string[]>([])
  const deferredSearch = useDeferredValue(search.trim())

  const query: SourceListQuery = useMemo(
    () => ({
      q: deferredSearch || undefined,
      connector_type: connector === 'all' ? undefined : (connector as ConnectorType),
      status: status === 'all' ? undefined : (status as SourceStatus),
      health: health === 'all' ? undefined : (health as HealthStatus),
    }),
    [deferredSearch, connector, status, health],
  )
  const filtering = Boolean(query.q || query.connector_type || query.status || query.health)
  // Tracked sync panels refresh the list when their runs settle, so no list polling is needed.
  const all = useSources(workspaceId)
  const filtered = useSources(workspaceId, query)
  const connectors = useConnectors()
  const actions = useSourceActions({ onSyncStarted: (run) => setTrackedRuns((prev) => [run.id, ...prev.filter((id) => id !== run.id)].slice(0, 3)) })

  const totals = useMemo(() => {
    const items = all.data ?? []
    return {
      count: items.length,
      healthy: items.filter((s) => s.health === 'healthy').length,
      attention: items.filter((s) => s.health === 'unhealthy' || s.health === 'degraded' || s.status === 'error').length,
      records: items.reduce((sum, s) => sum + s.total_records, 0),
    }
  }, [all.data])

  const connectorOptions = (connectors.data ?? []).filter((c) => c.status === 'available').map((c) => ({ value: c.type, label: c.name }))
  const clearFilters = () => {
    setSearch('')
    setConnector('all')
    setStatus('all')
    setHealth('all')
  }

  const setTab = (next: string) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'catalog') nextParams.set('tab', 'catalog')
    else nextParams.delete('tab')
    setParams(nextParams, { replace: true })
  }

  const noSources = all.data && all.data.length === 0

  return (
    <div>
      <PageHeader
        title="Data Sources"
        description={
          <span className="inline-flex flex-wrap items-center gap-1">
            Connect business systems and replicate their tables into the Bronze layer of your warehouse.
            <HelpTip label="What is the Bronze layer?">{BRONZE_HELP}</HelpTip>
          </span>
        }
        actions={<AddSourceButton />}
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="connections">
            <Database aria-hidden />
            Connections
            {all.data ? <span className="text-xs text-muted-foreground tabular">{all.data.length}</span> : null}
          </TabsTrigger>
          <TabsTrigger value="catalog">
            <LayoutGrid aria-hidden />
            Connector catalog
          </TabsTrigger>
        </TabsList>

        <TabsContent value="connections" className="space-y-4">
          {all.data && all.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Connected sources" value={totals.count} />
              <StatTile label="Healthy" value={totals.healthy} tone={totals.healthy === totals.count ? 'success' : undefined} />
              <StatTile label="Need attention" value={totals.attention} tone={totals.attention ? 'danger' : undefined} hint={totals.attention ? 'Failing or degraded connections' : 'All connections OK'} />
              <StatTile label="Records replicated" value={formatCompact(totals.records)} hint="Total loaded into Bronze" />
            </div>
          ) : null}

          {trackedRuns.map((runId) => (
            <SyncProgress key={runId} runId={runId} onDismiss={() => setTrackedRuns((prev) => prev.filter((id) => id !== runId))} />
          ))}

          {noSources ? null : (
            <TableToolbar className="mb-0">
              <SearchInput value={search} onChange={setSearch} placeholder="Search sources" />
              <FilterSelect value={connector} onChange={setConnector} options={connectorOptions} label="Connectors" />
              <FilterSelect value={status} onChange={setStatus} options={STATUS_OPTIONS} label="Statuses" />
              <FilterSelect value={health} onChange={setHealth} options={HEALTH_OPTIONS} label="Health" />
              {filtering ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              ) : null}
            </TableToolbar>
          )}

          {filtered.isLoading || all.isLoading ? (
            <TableSkeleton columns={6} />
          ) : filtered.error || all.error ? (
            <ErrorState
              error={filtered.error ?? all.error}
              title="Could not load data sources"
              onRetry={() => {
                void all.refetch()
                void filtered.refetch()
              }}
            />
          ) : noSources ? (
            <EmptyState
              icon={Database}
              title="No data sources yet"
              description="Connect Salesforce or a PostgreSQL database to start loading data into Bronze. Connection details are tested before anything is saved."
              action={
                <>
                  <AddSourceButton />
                  <Button variant="outline" onClick={() => setTab('catalog')}>
                    Browse connectors
                  </Button>
                </>
              }
            />
          ) : (
            <ConnectionsTable
              sources={filtered.data ?? []}
              connectors={connectors.data}
              actions={actions}
              empty={
                filtering ? (
                  <EmptyState
                    compact
                    title="No sources match these filters"
                    description="Try a different search, or clear the filters to see every connection."
                    action={
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    }
                  />
                ) : undefined
              }
            />
          )}
        </TabsContent>

        <TabsContent value="catalog">
          <ConnectorCatalog />
        </TabsContent>
      </Tabs>
      {actions.dialogs}
    </div>
  )
}
