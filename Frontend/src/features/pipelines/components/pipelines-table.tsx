import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { RunStatusBadge, SourceStatusBadge } from '@/components/status/status-badge'
import { DataTable, type Column } from '@/components/tables/data-table'
import { wsPath } from '@/hooks/use-workspace'
import { formatDuration, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Pipeline, Source } from '@/types'
import { PipelineRowActions } from './pipeline-row-actions'

function SuccessRate({ value }: { value: number | null }) {
  if (value === null) return <span className="text-subtle-foreground">—</span>
  const tone = value >= 0.95 ? 'text-foreground' : value >= 0.8 ? 'text-warning' : 'text-danger'
  return <span className={cn('tabular', tone)}>{formatPercent(value, 0)}</span>
}

export function PipelinesTable({
  pipelines,
  sources,
  workspaceId,
  empty,
}: {
  pipelines: Pipeline[]
  sources: Source[] | undefined
  workspaceId: string
  empty?: ReactNode
}) {
  const navigate = useNavigate()
  const sourceName = (id: string) => sources?.find((s) => s.id === id)?.name ?? id

  const columns: Column<Pipeline>[] = [
    {
      id: 'name',
      header: 'Pipeline',
      sortValue: (p) => p.name.toLowerCase(),
      className: 'max-w-[22rem]',
      cell: (p) => (
        <div className="min-w-0">
          <Link to={wsPath(workspaceId, 'pipelines', p.id)} onClick={(e) => e.stopPropagation()} className="font-medium hover:underline">
            {p.name}
          </Link>
          {p.description ? <p className="truncate text-xs text-muted-foreground">{p.description}</p> : null}
        </div>
      ),
    },
    {
      id: 'sources',
      header: 'Sources',
      hideOnMobile: true,
      cell: (p) => (
        <ul className="space-y-0.5 text-sm">
          {p.source_ids.map((id) => (
            <li key={id} className="truncate">
              {sourceName(id)}
            </li>
          ))}
        </ul>
      ),
    },
    { id: 'status', header: 'Status', sortValue: (p) => p.status, cell: (p) => <SourceStatusBadge status={p.status} /> },
    {
      id: 'last_run',
      header: 'Last run',
      sortValue: (p) => p.last_run?.queued_at ?? '',
      cell: (p) =>
        p.last_run ? (
          <div className="flex flex-col items-start gap-0.5">
            <RunStatusBadge status={p.last_run.status} />
            <TimeAgo value={p.last_run.finished_at ?? p.last_run.started_at ?? p.last_run.queued_at} className="text-xs text-muted-foreground" />
          </div>
        ) : (
          <RunStatusBadge status={null} />
        ),
    },
    { id: 'success', header: 'Success 7d', hideOnMobile: true, sortValue: (p) => p.success_rate_7d ?? -1, cell: (p) => <SuccessRate value={p.success_rate_7d} /> },
    {
      id: 'avg_duration',
      header: 'Avg duration',
      hideOnMobile: true,
      sortValue: (p) => p.avg_duration_seconds ?? -1,
      cell: (p) => <span className="tabular">{formatDuration(p.avg_duration_seconds)}</span>,
    },
    {
      id: 'next_run',
      header: 'Next run',
      hideOnMobile: true,
      sortValue: (p) => p.next_run_at ?? '~',
      cell: (p) =>
        p.next_run_at ? (
          <TimeAgo value={p.next_run_at} className="text-sm" />
        ) : (
          <span className="text-xs text-subtle-foreground">{p.status === 'active' ? 'Not scheduled' : p.status === 'paused' ? 'Paused' : 'Draft'}</span>
        ),
    },
    { id: 'actions', header: <span className="sr-only">Actions</span>, className: 'w-10 text-right', cell: (p) => <PipelineRowActions pipeline={p} workspaceId={workspaceId} /> },
  ]

  return (
    <DataTable
      columns={columns}
      rows={pipelines}
      getRowId={(p) => p.id}
      onRowClick={(p) => navigate(wsPath(workspaceId, 'pipelines', p.id))}
      empty={empty}
      caption="Pipelines"
    />
  )
}
