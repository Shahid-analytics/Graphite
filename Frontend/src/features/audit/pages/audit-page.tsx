import { CalendarX, FileClock, SearchX } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { HelpTip } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { SimulatedBadge } from '@/components/status/simulated'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { formatDateTimeSeconds, formatNumber } from '@/lib/format'
import type { AuditEvent } from '@/types'
import { ActorLabel, AuditStatusBadge, ExecutionLink, ResourceLabel } from '../components/audit-cells'
import { AuditEventSheet } from '../components/audit-event-sheet'
import { AuditExportMenu } from '../components/audit-export-menu'
import { AuditFilterBar } from '../components/audit-filters'
import { dateRangeError, useAuditFilters } from '../lib/filters'
import { AUDIT_PAGE_SIZE, useAuditEvents, useAuditFacets } from '../queries'

export default function AuditPage() {
  const { workspaceId } = useWorkspace()
  const { filters, page, setFilters, setPage, clear, activeCount } = useAuditFilters()
  const rangeError = dateRangeError(filters)
  // The API rejects a reversed range (422); explain it inline instead of requesting.
  const events = useAuditEvents(workspaceId, filters, page, !rangeError)
  const facets = useAuditFacets(workspaceId)
  const [selected, setSelected] = useState<AuditEvent | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const columns = useMemo<Column<AuditEvent>[]>(
    () => [
      {
        id: 'occurred_at',
        header: 'Timestamp',
        cell: (row) => (
          <time dateTime={row.occurred_at} className="font-mono text-xs whitespace-nowrap tabular text-muted-foreground">
            {formatDateTimeSeconds(row.occurred_at)}
          </time>
        ),
      },
      { id: 'actor', header: 'Actor', cell: (row) => <ActorLabel actor={row.actor} className="max-w-48" />, hideOnMobile: true },
      {
        id: 'action',
        header: 'Action',
        cell: (row) => (
          <span className="flex flex-col">
            <span className="font-mono text-xs whitespace-nowrap">{row.action}</span>
            {/* The actor column is hidden on phones; show who acted under the action instead. */}
            <span className="text-xs text-muted-foreground md:hidden">{row.actor.name}</span>
          </span>
        ),
      },
      {
        id: 'resource',
        header: 'Resource',
        cell: (row) => (
          <span className="block max-w-56">
            <ResourceLabel workspaceId={workspaceId} resource={row.resource} />
          </span>
        ),
        hideOnMobile: true,
      },
      {
        id: 'workspace',
        header: 'Workspace',
        cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{row.workspace_name}</span>,
        // Always the current workspace here, so only shown on wide screens.
        className: 'hidden 2xl:table-cell',
        headerClassName: 'hidden 2xl:table-cell',
      },
      { id: 'status', header: 'Status', cell: (row) => <AuditStatusBadge status={row.status} /> },
      { id: 'execution', header: 'Execution ID', cell: (row) => <ExecutionLink workspaceId={workspaceId} executionId={row.execution_id} />, hideOnMobile: true },
      {
        id: 'changes',
        header: 'Changes',
        cell: (row) =>
          row.changes.length ? (
            <span className="tabular" aria-label={`${row.changes.length} field changes`}>
              {row.changes.length}
            </span>
          ) : (
            <span className="text-subtle-foreground">—</span>
          ),
        className: 'text-right',
        headerClassName: 'text-right',
        hideOnMobile: true,
      },
    ],
    [workspaceId],
  )

  const openEvent = (event: AuditEvent) => {
    setSelected(event)
    setSheetOpen(true)
  }

  const data = events.data
  const total = data?.total ?? 0

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        meta={<SimulatedBadge label="Demo data" reason="Events shown here are produced by the in-browser mock API. No real audit store was queried." />}
        description={
          <>
            Who changed what, and when, across sources, pipelines, models and settings. Durable audit persistence and retention are provided
            by the backend; see{' '}
            <Link to={wsPath(workspaceId, 'settings', 'audit-retention')} className="font-medium text-foreground underline-offset-4 hover:underline">
              Settings &gt; Audit retention
            </Link>
            .
          </>
        }
        actions={<AuditExportMenu filters={filters} activeFilterCount={activeCount} invalidReason={rangeError} />}
      />

      <AuditFilterBar
        filters={filters}
        facets={facets.data}
        facetsLoading={facets.isLoading}
        facetsError={facets.isError}
        onRetryFacets={() => facets.refetch()}
        rangeError={rangeError}
        activeCount={activeCount}
        onChange={setFilters}
        onClear={clear}
      />

      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span aria-live="polite">
          {rangeError ? '' : data ? `${formatNumber(total)} event${total === 1 ? '' : 's'}` : events.isLoading ? 'Loading events' : ''}
          {!rangeError && events.isFetching && !events.isLoading ? ' · refreshing' : ''}
        </span>
        <span className="flex items-center gap-1">
          Newest first
          <HelpTip label="About audit ordering">
            Events are returned newest first by the server. Each event is immutable; corrections appear as new events.
          </HelpTip>
        </span>
      </div>

      {rangeError ? (
        <EmptyState
          icon={CalendarX}
          title="Invalid date range"
          description={rangeError}
          action={
            <Button variant="outline" size="sm" onClick={() => setFilters({ from: '', to: '' })}>
              Clear dates
            </Button>
          }
        />
      ) : events.isLoading ? (
        <TableSkeleton rows={10} columns={6} />
      ) : events.isError && !data ? (
        <ErrorState error={events.error} title="Could not load audit events" onRetry={() => events.refetch()} />
      ) : data && !data.items.length ? (
        total > 0 ? (
          <EmptyState
            icon={SearchX}
            title="This page is past the end of the results"
            description={`There are ${formatNumber(total)} matching events.`}
            action={
              <Button variant="outline" size="sm" onClick={() => setPage(1)}>
                Go to first page
              </Button>
            }
          />
        ) : activeCount ? (
          <EmptyState
            icon={SearchX}
            title="No events match these filters"
            description="Try a wider date range or remove a filter."
            action={
              <Button variant="outline" size="sm" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={FileClock}
            title="No audit events yet"
            description="Events are recorded when members connect sources, run pipelines, change schedules or update settings."
            action={
              <Button asChild variant="outline" size="sm">
                <Link to={wsPath(workspaceId, 'sources')}>Go to data sources</Link>
              </Button>
            }
          />
        )
      ) : data ? (
        <>
          {events.isError ? (
            <ErrorState compact className="mb-3" error={events.error} title="Could not refresh audit events" onRetry={() => events.refetch()} />
          ) : null}
          <DataTable
            caption="Audit events"
            columns={columns}
            rows={data.items}
            getRowId={(row) => row.id}
            onRowClick={openEvent}
            pagination={{ page: data.page, pageSize: data.page_size || AUDIT_PAGE_SIZE, total, onPageChange: setPage }}
            className={events.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}
          />
        </>
      ) : null}

      <AuditEventSheet event={selected} workspaceId={workspaceId} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  )
}
