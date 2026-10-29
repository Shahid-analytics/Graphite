import { ChevronDown, DatabaseZap, Pause, Play, PlugZap, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { PageHeader } from '@/components/layout/page-header'
import { HealthIndicator, SourceStatusBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isApiError } from '@/services/api-error'
import { isTerminal, type ConnectorDefinition, type Run, type Source } from '@/types'
import { ErrorsTab } from '../components/detail/errors-tab'
import { OverviewTab } from '../components/detail/overview-tab'
import { PreviewTab } from '../components/detail/preview-tab'
import { RunsTab } from '../components/detail/runs-tab'
import { SettingsTab } from '../components/detail/settings-tab'
import { TablesTab } from '../components/detail/tables-tab'
import { GatedButton } from '../components/primitives'
import { useSourceActions, useSourceActionState } from '../components/source-actions'
import { SyncProgress } from '../components/sync-progress'
import { useConnectors, useSource, useSourceRuns } from '../queries'

const TABS = ['overview', 'tables', 'runs', 'errors', 'preview', 'settings'] as const
type Tab = (typeof TABS)[number]

function SyncButton({ source, reason, pending, onSync }: { source: Source; reason: string | null; pending: boolean; onSync: (mode?: 'full' | 'incremental') => void }) {
  const hasIncremental = source.selected_tables.some((t) => t.ingestion_mode === 'incremental')
  return (
    <div className="inline-flex">
      <GatedButton reason={reason} loading={pending} onClick={() => onSync()} className="rounded-r-none">
        <RefreshCw className="size-4" aria-hidden />
        Sync now
      </GatedButton>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button className="rounded-l-none border-l border-primary-foreground/20 px-2" disabled={Boolean(reason) || pending} aria-label="More sync options">
            <ChevronDown className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuItem onSelect={() => onSync('incremental')} className="items-start">
            <RefreshCw className="mt-0.5" aria-hidden />
            <span className="flex flex-col">
              <span>Incremental sync</span>
              <span className="text-xs text-muted-foreground">
                {hasIncremental ? 'Fetch rows changed since the last cursor. Full-load tables are reloaded.' : 'All selected tables use full loads, so this reloads them.'}
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onSync('full')} className="items-start">
            <DatabaseZap className="mt-0.5" aria-hidden />
            <span className="flex flex-col">
              <span>Full refresh</span>
              <span className="text-xs text-muted-foreground">Re-read every row of every selected table and reset cursors. Slower and heavier on the source.</span>
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function HealthNotice({ source, onUpdateCredentials, onTest, testReason, writeReason }: { source: Source; onUpdateCredentials: () => void; onTest: () => void; testReason: string | null; writeReason: string | null }) {
  const { workspaceId } = useWorkspace()
  if (source.health === 'unhealthy') {
    return (
      <Notice
        tone="danger"
        title="This source is failing"
        className="mb-4"
        action={
          <>
            <GatedButton size="sm" variant="outline" reason={testReason} onClick={onTest}>
              Test connection
            </GatedButton>
            <GatedButton size="sm" reason={writeReason} onClick={onUpdateCredentials}>
              Update credentials
            </GatedButton>
          </>
        }
      >
        {source.health_message ?? 'The last sync failed to connect.'} Scheduled syncs and pipelines that read from it will keep failing until this is fixed.
      </Notice>
    )
  }
  if (source.health === 'degraded') {
    return (
      <Notice
        tone="warning"
        title="This source needs attention"
        className="mb-4"
        action={
          <Button asChild size="sm" variant="outline">
            <Link to={wsPath(workspaceId, 'models')}>Review data models</Link>
          </Button>
        }
      >
        {source.health_message ?? 'Recent syncs reported warnings.'} Syncs still run, but downstream models may need updating.
      </Notice>
    )
  }
  if (source.health === 'unknown' && source.health_message) {
    return (
      <Notice tone="info" className="mb-4">
        {source.health_message}
      </Notice>
    )
  }
  return null
}

function SourceDetail({ source, connector }: { source: Source; connector?: ConnectorDefinition }) {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const requestedTab = params.get('tab') as Tab | null
  const tab: Tab = requestedTab && TABS.includes(requestedTab) ? requestedTab : 'overview'
  const [trackedRunId, setTrackedRunId] = useState<string | null>(() => (location.state as { runId?: string | null } | null)?.runId ?? null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const latest = useSourceRuns(source.id, { page: 1, page_size: 5 })
  const activeSync = latest.data?.items.find((r) => r.kind === 'ingestion' && !isTerminal(r.status))
  const shownRunId = trackedRunId ?? (activeSync && activeSync.id !== dismissed ? activeSync.id : null)
  const state = useSourceActionState(source)
  const syncReason = state.syncReason ?? (activeSync ? 'A sync is already running. Wait for it to finish or cancel it.' : null)

  const track = (run: Run) => {
    if (run.kind === 'ingestion') setTrackedRunId(run.id)
  }
  const actions = useSourceActions({
    onSyncStarted: (run) => setTrackedRunId(run.id),
    onDeleted: () => navigate(wsPath(workspaceId, 'sources'), { replace: true }),
  })

  const setTab = (next: string) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'overview') nextParams.delete('tab')
    else nextParams.set('tab', next)
    setParams(nextParams, { replace: true })
  }

  const paused = source.status === 'paused'

  return (
    <div>
      <PageHeader
        title={source.name}
        breadcrumbs={[{ label: 'Data Sources', to: wsPath(workspaceId, 'sources') }, { label: source.name }]}
        meta={
          <>
            <SourceStatusBadge status={source.status} />
            <HealthIndicator status={source.health} className="text-xs" />
          </>
        }
        description={
          <>
            {connector?.name ?? source.connector_type} via {connector?.engine ?? 'dlt'} into <span className="font-mono text-[13px]">{source.destination_schema}</span>
          </>
        }
        actions={
          <>
            <SyncButton source={source} reason={syncReason} pending={actions.syncPending} onSync={(mode) => actions.startSync(source, mode)} />
            <GatedButton variant="outline" reason={state.testReason} onClick={() => actions.openTest(source)}>
              <PlugZap className="size-4" aria-hidden />
              Test connection
            </GatedButton>
            <GatedButton
              variant="outline"
              reason={state.writeReason ?? (source.status === 'draft' ? 'Draft sources cannot be paused.' : null)}
              loading={actions.updatePending}
              onClick={() => actions.togglePause(source)}
            >
              {paused ? <Play className="size-4" aria-hidden /> : <Pause className="size-4" aria-hidden />}
              {paused ? 'Resume' : 'Pause'}
            </GatedButton>
            <GatedButton variant="outline" size="icon" reason={state.writeReason} onClick={() => actions.openDelete(source)} aria-label="Delete source">
              <Trash2 className="size-4 text-danger" aria-hidden />
            </GatedButton>
          </>
        }
      />

      <HealthNotice
        source={source}
        onTest={() => actions.openTest(source)}
        onUpdateCredentials={() => setTab('settings')}
        testReason={state.testReason}
        writeReason={state.writeReason}
      />
      {paused ? (
        <Notice className="mb-4" title="Paused">
          {source.health_message ?? 'This source is paused.'} Scheduled syncs are suspended and manual syncs are disabled until you resume.
        </Notice>
      ) : null}

      {shownRunId ? (
        <SyncProgress
          key={shownRunId}
          runId={shownRunId}
          className="mb-4"
          onDismiss={() => {
            setDismissed(shownRunId)
            setTrackedRunId(null)
          }}
        />
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tables">
            Tables <span className="text-xs text-muted-foreground tabular">{source.selected_tables.length}</span>
          </TabsTrigger>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="errors">Errors</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <OverviewTab source={source} connector={connector} onViewRuns={() => setTab('runs')} />
        </TabsContent>
        <TabsContent value="tables">
          <TablesTab source={source} connector={connector} />
        </TabsContent>
        <TabsContent value="runs">
          <RunsTab sourceId={source.id} onRunStarted={track} />
        </TabsContent>
        <TabsContent value="errors">
          <ErrorsTab sourceId={source.id} onRunStarted={track} onOpenSettings={() => setTab('settings')} onTest={() => actions.openTest(source)} testReason={state.testReason} />
        </TabsContent>
        <TabsContent value="preview">
          <PreviewTab source={source} syncReason={syncReason} onSync={() => actions.startSync(source)} />
        </TabsContent>
        <TabsContent value="settings">
          {connector ? (
            <SettingsTab key={source.updated_at} source={source} connector={connector} onDelete={() => actions.openDelete(source)} />
          ) : (
            <Notice tone="warning" title="Connector definition unavailable">
              The {source.connector_type} connector is not in the catalog, so its settings cannot be edited here.
            </Notice>
          )}
        </TabsContent>
      </Tabs>
      {actions.dialogs}
    </div>
  )
}

export default function SourceDetailPage() {
  const { sourceId = '' } = useParams()
  const { workspaceId } = useWorkspace()
  const source = useSource(sourceId)
  const connectors = useConnectors()

  if (source.isLoading || connectors.isLoading) return <PageSkeleton />

  const crumbs = [{ label: 'Data Sources', to: wsPath(workspaceId, 'sources') }, { label: 'Source' }]
  if (source.error || !source.data) {
    const missing = isApiError(source.error) && source.error.status === 404
    return (
      <div>
        <PageHeader title={missing ? 'Source not found' : 'Data source'} breadcrumbs={crumbs} />
        {missing ? (
          <EmptyState
            title="This source does not exist"
            description="It may have been deleted, or the link is wrong."
            action={
              <Button asChild variant="outline">
                <Link to={wsPath(workspaceId, 'sources')}>Back to data sources</Link>
              </Button>
            }
          />
        ) : (
          <ErrorState error={source.error} title="Could not load this source" onRetry={() => void source.refetch()} />
        )}
      </div>
    )
  }
  if (source.data.workspace_id !== workspaceId) {
    return (
      <div>
        <PageHeader title="Source not in this workspace" breadcrumbs={crumbs} />
        <EmptyState
          title="This source belongs to another workspace"
          description="Switch to that workspace to view it."
          action={
            <Button asChild variant="outline">
              <Link to={wsPath(source.data.workspace_id, 'sources', source.data.id)}>Open in its workspace</Link>
            </Button>
          }
        />
      </div>
    )
  }
  return <SourceDetail key={source.data.id} source={source.data} connector={connectors.data?.find((c) => c.type === source.data.connector_type)} />
}
