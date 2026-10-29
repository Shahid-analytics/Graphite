import { Workflow } from 'lucide-react'
import { useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { RunStatusBadge } from '@/components/status/status-badge'
import { DataTable, type Column } from '@/components/tables/data-table'
import { wsPath } from '@/hooks/use-workspace'
import { formatDuration } from '@/lib/format'
import { pluralize } from '@/lib/utils'
import { isTerminal, type RunSummary } from '@/types'
import { RUN_KIND_LABELS, RUN_TRIGGER_LABELS } from './labels'
import { CardLink, CtaLink, OverviewCard, RowLink } from './overview-card'

export function RecentRunsCard({ runs, workspaceId, className }: { runs: RunSummary[]; workspaceId: string; className?: string }) {
  const navigate = useNavigate()
  const active = runs.filter((r) => !isTerminal(r.status)).length
  const runPath = (run: RunSummary) => wsPath(workspaceId, 'runs', run.id)

  const columns: Column<RunSummary>[] = [
    { id: 'status', header: 'Status', cell: (run) => <RunStatusBadge status={run.status} />, className: 'w-28' },
    {
      id: 'target',
      header: 'Target',
      cell: (run) => (
        <div className="min-w-0 max-w-[10rem] sm:max-w-[16rem]">
          <RowLink to={runPath(run)} className="block truncate font-medium">
            {run.target_name}
          </RowLink>
          <p className="truncate text-xs text-muted-foreground">
            {RUN_KIND_LABELS[run.kind]}
            {run.attempt > 1 ? ` · attempt ${run.attempt}` : ''}
          </p>
        </div>
      ),
    },
    { id: 'trigger', header: 'Trigger', cell: (run) => <span className="text-muted-foreground">{RUN_TRIGGER_LABELS[run.trigger]}</span>, hideOnMobile: true },
    { id: 'started', header: 'Started', cell: (run) => <TimeAgo value={run.started_at ?? run.queued_at} className="text-muted-foreground" /> },
    {
      id: 'duration',
      header: 'Duration',
      cell: (run) => <span className="text-muted-foreground tabular">{isTerminal(run.status) ? formatDuration(run.duration_seconds) : 'In progress'}</span>,
      hideOnMobile: true,
      className: 'text-right',
      headerClassName: 'text-right',
    },
  ]

  return (
    <OverviewCard
      title="Recent pipeline runs"
      description="Latest pipeline runs and source syncs."
      className={className}
      contentClassName={runs.length ? 'px-0 pb-0' : undefined}
      action={<CardLink to={wsPath(workspaceId, 'pipelines')}>All pipelines</CardLink>}
    >
      <p className="sr-only" aria-live="polite">
        {active ? `${pluralize(active, 'run')} in progress` : 'No runs in progress'}
      </p>
      <DataTable
        columns={columns}
        rows={runs}
        getRowId={(run) => run.id}
        onRowClick={(run) => navigate(runPath(run))}
        pageSize={8}
        caption="Recent pipeline runs and source syncs"
        className="rounded-none rounded-b-lg border-0 border-t"
        empty={
          <EmptyState
            compact
            icon={Workflow}
            title="No pipeline runs yet"
            description="Runs appear here once a pipeline or source sync is triggered manually or by a schedule."
            action={
              <CtaLink to={wsPath(workspaceId, 'pipelines', 'new')} permission="pipelines:write" deniedReason="Creating pipelines requires the admin or owner role.">
                Set up a pipeline
              </CtaLink>
            }
          />
        }
      />
    </OverviewCard>
  )
}
