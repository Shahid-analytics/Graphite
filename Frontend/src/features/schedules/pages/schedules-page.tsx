import { CalendarClock, Plus } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { RunStatusBadge } from '@/components/status/status-badge'
import { DataTable, FilterSelect, SearchInput, TableToolbar, type Column } from '@/components/tables/data-table'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { describeCron } from '@/lib/cron'
import type { Schedule, ScheduleListQuery, ScheduleTargetType } from '@/types'
import { Gated, permissionReason } from '../components/gated'
import { ScheduleEnabledSwitch } from '../components/schedule-enabled-switch'
import { ScheduleRowActions } from '../components/schedule-row-actions'
import { SchedulerNote } from '../components/scheduler-note'
import { StopPropagation } from '../components/stop-propagation'
import { TargetLabel } from '../components/target-label'
import { UpcomingStrip } from '../components/upcoming-strip'
import { TARGET_META, TARGET_TYPES } from '../lib/schedule-utils'
import { useDebouncedValue } from '../lib/use-debounced-value'
import { useSchedules } from '../queries'

const STATUS_OPTIONS = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
]

const TYPE_OPTIONS = TARGET_TYPES.map((t) => ({ value: t, label: TARGET_META[t].label }))

export default function SchedulesPage() {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const canWrite = usePermission('schedules:write')
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? 'all'
  const type = params.get('type') ?? 'all'
  const search = params.get('q') ?? ''
  const q = useDebouncedValue(search.trim(), 300)

  const setParam = (key: string, value: string, empty: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === empty) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  const query = useMemo<ScheduleListQuery>(
    () => ({
      q: q || undefined,
      enabled: status === 'all' ? undefined : status === 'enabled',
      target_type: type === 'all' ? undefined : (type as ScheduleTargetType),
    }),
    [q, status, type],
  )
  const filtered = status !== 'all' || type !== 'all' || Boolean(q)

  const all = useSchedules(workspaceId)
  const list = useSchedules(workspaceId, query)

  const createButton = (
    <Gated allowed={canWrite} reason={permissionReason('schedules:write')}>
      {canWrite ? (
        <Button asChild>
          <Link to={wsPath(workspaceId, 'schedules', 'new')}>
            <Plus aria-hidden />
            Create schedule
          </Link>
        </Button>
      ) : (
        <Button disabled>
          <Plus aria-hidden />
          Create schedule
        </Button>
      )}
    </Gated>
  )

  const total = all.data?.length ?? 0
  const enabledCount = all.data?.filter((s) => s.enabled).length ?? 0

  const columns: Column<Schedule>[] = [
    {
      id: 'name',
      header: 'Schedule',
      sortValue: (s) => s.name.toLowerCase(),
      className: 'max-w-[16rem]',
      cell: (s) => (
        <div className="min-w-0">
          <StopPropagation className="max-w-full">
            <Link to={wsPath(workspaceId, 'schedules', s.id)} className="truncate font-medium hover:underline">
              {s.name}
            </Link>
          </StopPropagation>
          {s.description ? <p className="truncate text-xs text-muted-foreground">{s.description}</p> : null}
          <div className="mt-1 space-y-0.5 md:hidden">
            <StopPropagation className="max-w-full text-xs">
              <TargetLabel schedule={s} />
            </StopPropagation>
            <p className="truncate text-xs text-muted-foreground">
              {describeCron(s.cron)} · {s.timezone}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'target',
      header: 'Target',
      hideOnMobile: true,
      sortValue: (s) => s.target_name.toLowerCase(),
      className: 'max-w-[12rem]',
      cell: (s) => (
        <div className="min-w-0">
          <StopPropagation className="max-w-full">
            <TargetLabel schedule={s} />
          </StopPropagation>
          <p className="text-xs text-muted-foreground">{TARGET_META[s.target_type].label}</p>
        </div>
      ),
    },
    {
      id: 'cadence',
      header: 'Cadence',
      hideOnMobile: true,
      className: 'max-w-[14rem]',
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-sm" title={describeCron(s.cron)}>
            {describeCron(s.cron)}
          </p>
          <code className="font-mono text-xs text-muted-foreground">{s.cron}</code>
          <span className="text-xs text-muted-foreground 2xl:hidden"> · {s.timezone}</span>
        </div>
      ),
    },
    {
      id: 'timezone',
      header: 'Timezone',
      // Shown inside the cadence cell below the 2xl breakpoint to keep the table within the viewport.
      className: 'hidden 2xl:table-cell',
      headerClassName: 'hidden 2xl:table-cell',
      sortValue: (s) => s.timezone,
      cell: (s) => <span className="text-sm whitespace-nowrap text-muted-foreground">{s.timezone}</span>,
    },
    {
      id: 'next',
      header: 'Next run',
      sortValue: (s) => s.next_run_at,
      cell: (s) =>
        s.enabled ? <TimeAgo value={s.next_run_at} className="text-sm" /> : <span className="text-xs text-muted-foreground">Disabled</span>,
    },
    {
      id: 'last',
      header: 'Last run',
      hideOnMobile: true,
      sortValue: (s) => s.last_run?.queued_at,
      cell: (s) =>
        s.last_run ? (
          <StopPropagation className="flex-col items-start gap-0.5">
            <Link to={wsPath(workspaceId, 'runs', s.last_run.id)} className="rounded-md" aria-label={`Last run ${s.last_run.id}: ${s.last_run.status}`}>
              <RunStatusBadge status={s.last_run.status} />
            </Link>
            <TimeAgo value={s.last_run.finished_at ?? s.last_run.started_at ?? s.last_run.queued_at} className="text-xs text-muted-foreground" />
          </StopPropagation>
        ) : (
          <span className="text-xs text-muted-foreground">Never run</span>
        ),
    },
    {
      id: 'enabled',
      header: 'Enabled',
      sortValue: (s) => s.enabled,
      cell: (s) => (
        <StopPropagation>
          <ScheduleEnabledSwitch schedule={s} />
        </StopPropagation>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      headerClassName: 'w-10',
      className: 'w-10 text-right',
      cell: (s) => (
        <StopPropagation>
          <ScheduleRowActions schedule={s} />
        </StopPropagation>
      ),
    },
  ]

  const renderBody = () => {
    if (list.isLoading) return <TableSkeleton rows={6} columns={6} />
    if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} title="Could not load schedules" />
    const rows = list.data ?? []
    if (!rows.length && !filtered) {
      return (
        <EmptyState
          icon={CalendarClock}
          title="No schedules yet"
          description="Schedules run pipelines, source syncs and dbt transformations on a recurring cadence so dashboards stay fresh without manual runs."
          action={
            <>
              {createButton}
              <Button variant="outline" asChild>
                <Link to={wsPath(workspaceId, 'pipelines')}>View pipelines</Link>
              </Button>
            </>
          }
        />
      )
    }
    return (
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        onRowClick={(s) => navigate(wsPath(workspaceId, 'schedules', s.id))}
        pageSize={20}
        caption="Schedules"
        rowClassName={(s) => (s.enabled ? undefined : 'text-muted-foreground')}
      />
    )
  }

  return (
    <div>
      <PageHeader
        title="Schedules"
        description={
          all.data
            ? `${total} ${total === 1 ? 'schedule' : 'schedules'}, ${enabledCount} enabled. Recurring pipeline runs, source syncs and dbt transformations.`
            : 'Recurring pipeline runs, source syncs and dbt transformations.'
        }
        actions={createButton}
      />

      {all.isError ? null : <UpcomingStrip schedules={all.data} isLoading={all.isLoading} />}

      <TableToolbar>
        <SearchInput value={search} onChange={(v) => setParam('q', v, '')} placeholder="Search schedules" />
        <FilterSelect label="Statuses" value={status} onChange={(v) => setParam('status', v, 'all')} options={STATUS_OPTIONS} />
        <FilterSelect label="Target types" value={type} onChange={(v) => setParam('type', v, 'all')} options={TYPE_OPTIONS} />
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={() => setParams({}, { replace: true })}>
            Clear filters
          </Button>
        ) : null}
      </TableToolbar>

      <div className="overflow-x-auto">{renderBody()}</div>

      <SchedulerNote className="mt-4" />
    </div>
  )
}
