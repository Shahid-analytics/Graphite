import { ArrowRight, History } from 'lucide-react'
import { Link } from 'react-router'
import { HelpTip, KeyValueGrid, TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { LayerBadge, RunStatusBadge } from '@/components/status/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDateTime, formatDuration, formatNumber } from '@/lib/format'
import type { ConnectorDefinition, Source } from '@/types'
import { BRONZE_HELP, describeSchedule } from '../../lib/labels'
import { useSourceRuns } from '../../queries'
import { runLabel, TRIGGER_LABELS } from './run-helpers'

function LatestRuns({ sourceId, onViewAll }: { sourceId: string; onViewAll: () => void }) {
  const { workspaceId } = useWorkspace()
  const { data, isLoading, error, refetch } = useSourceRuns(sourceId, { page: 1, page_size: 5 })
  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true" aria-label="Loading runs">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    )
  }
  if (error) return <ErrorState compact error={error} title="Could not load recent runs" onRetry={() => void refetch()} />
  if (!data?.items.length) {
    return <EmptyState compact icon={History} title="No runs yet" description="Run a sync to load this source into Bronze. Runs from pipelines that use this source also appear here." />
  }
  return (
    <div className="space-y-2">
      {/* Sized by its column, not the viewport: the list sits in a narrow side column on wide screens. */}
      <ul className="@container divide-y divide-border rounded-lg border border-border">
        {data.items.map((run) => (
          <li key={run.id}>
            <Link
              to={wsPath(workspaceId, 'runs', run.id)}
              className="flex flex-col gap-1 px-3 py-2.5 outline-none hover:bg-surface focus-visible:bg-surface @lg:flex-row @lg:items-center @lg:gap-3"
            >
              <span className="w-28 shrink-0">
                <RunStatusBadge status={run.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{runLabel(run)}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {TRIGGER_LABELS[run.trigger]}
                  {run.attempt > 1 ? ` · attempt ${run.attempt}` : ''}
                  {run.error ? ` · ${run.error.message}` : ''}
                </span>
              </span>
              <span className="flex shrink-0 gap-4 text-xs text-muted-foreground tabular">
                <TimeAgo value={run.started_at ?? run.queued_at} />
                <span>{formatDuration(run.duration_seconds)}</span>
                <span>{run.records_processed !== null ? `${formatNumber(run.records_processed)} rows` : '—'}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {data.total > data.items.length ? (
        <Button variant="link" size="sm" onClick={onViewAll}>
          View all {data.total} runs
          <ArrowRight className="size-3.5" aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}

export function OverviewTab({ source, connector, onViewRuns }: { source: Source; connector?: ConnectorDefinition; onViewRuns: () => void }) {
  const incremental = source.selected_tables.filter((t) => t.ingestion_mode === 'incremental').length
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardContent>
          <KeyValueGrid
            columns={2}
            items={[
              {
                label: 'Last sync',
                value: source.last_sync_at ? (
                  <span className="inline-flex items-center gap-2">
                    <TimeAgo value={source.last_sync_at} />
                    <RunStatusBadge status={source.last_sync_status} />
                  </span>
                ) : (
                  'Never'
                ),
              },
              { label: 'Last successful sync', value: source.last_successful_sync_at ? <TimeAgo value={source.last_successful_sync_at} /> : 'Never' },
              { label: 'Duration of last sync', value: formatDuration(source.last_sync_duration_seconds) },
              { label: 'Records in last sync', value: formatNumber(source.last_sync_records) },
              { label: 'Total records loaded', value: formatNumber(source.total_records) },
              {
                label: 'Next sync',
                value: source.next_sync_at ? (
                  <TimeAgo value={source.next_sync_at} />
                ) : source.status === 'paused' ? (
                  'Paused'
                ) : source.schedule.frequency === 'manual' ? (
                  'Manual only'
                ) : (
                  '—'
                ),
              },
              { label: 'Schedule', value: describeSchedule(source.schedule) },
              {
                label: (
                  <span className="inline-flex items-center gap-1">
                    Destination schema <HelpTip label="What is Bronze?">{BRONZE_HELP}</HelpTip>
                  </span>
                ),
                value: (
                  <span className="inline-flex items-center gap-1.5">
                    <LayerBadge layer="bronze" />
                    <span className="font-mono text-[13px]">{source.destination_schema}</span>
                  </span>
                ),
              },
              { label: 'Connector', value: connector ? `${connector.name} (${connector.engine})` : source.connector_type },
              { label: 'Tables', value: `${source.selected_tables.length} selected (${incremental} incremental, ${source.selected_tables.length - incremental} full)` },
              { label: 'Created by', value: source.created_by.name },
              { label: 'Created', value: formatDateTime(source.created_at) },
            ]}
          />
        </CardContent>
      </Card>
      <Section title="Latest runs" description="Syncs of this source and pipeline runs that read from it.">
        <LatestRuns sourceId={source.id} onViewAll={onViewRuns} />
      </Section>
    </div>
  )
}
