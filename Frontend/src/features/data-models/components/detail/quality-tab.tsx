import { ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { HelpTip, TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { DataTable, FilterSelect, TableToolbar, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { wsPath } from '@/hooks/use-workspace'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { DataModel, QualityCheck, QualityStatus } from '@/types'
import { CHECK_TYPE_LABEL } from '../../lib/labels'
import { useModelQualityChecks } from '../../queries'
import { QualityStatusBadge } from '../quality-indicator'

const STATUS_OPTIONS: { value: QualityStatus; label: string }[] = [
  { value: 'failed', label: 'Failed' },
  { value: 'warning', label: 'Warning' },
  { value: 'passed', label: 'Passed' },
  { value: 'not_run', label: 'Not run' },
]

const STATUS_RANK: Record<QualityStatus, number> = { failed: 0, warning: 1, not_run: 2, passed: 3 }

function buildColumns(workspaceId: string): Column<QualityCheck>[] {
  return [
    {
      id: 'name',
      header: 'Check',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <p className="truncate font-mono text-xs font-medium">{c.name}</p>
          {c.message ? <p className="mt-0.5 max-w-md text-xs whitespace-normal text-muted-foreground">{c.message}</p> : null}
        </div>
      ),
    },
    { id: 'column', header: 'Column', sortValue: (c) => c.column, cell: (c) => (c.column ? <span className="font-mono text-xs text-muted-foreground">{c.column}</span> : <span className="text-xs text-subtle-foreground">Whole table</span>), hideOnMobile: true },
    { id: 'type', header: 'Type', sortValue: (c) => c.check_type, cell: (c) => <span className="text-sm">{CHECK_TYPE_LABEL[c.check_type]}</span>, hideOnMobile: true },
    {
      id: 'severity',
      header: 'Severity',
      sortValue: (c) => c.severity,
      cell: (c) => <Badge variant={c.severity === 'error' ? 'outline' : 'default'}>{c.severity === 'error' ? 'Error' : 'Warn'}</Badge>,
      hideOnMobile: true,
    },
    { id: 'status', header: 'Status', sortValue: (c) => STATUS_RANK[c.status], cell: (c) => <QualityStatusBadge status={c.status} /> },
    {
      id: 'failing',
      header: 'Failing rows',
      sortValue: (c) => c.failing_rows,
      className: 'text-right tabular text-sm',
      headerClassName: 'text-right',
      cell: (c) => <span className={cn(c.failing_rows > 0 ? 'font-medium text-foreground' : 'text-subtle-foreground')}>{formatNumber(c.failing_rows)}</span>,
      hideOnMobile: true,
    },
    {
      id: 'last_run',
      header: 'Last run',
      sortValue: (c) => c.last_run_at,
      cell: (c) => (
        <div className="flex flex-col items-start gap-0.5">
          <TimeAgo value={c.last_run_at} className="text-sm text-muted-foreground" />
          {c.run_id ? (
            <Link to={wsPath(workspaceId, 'runs', c.run_id)} className="text-xs text-foreground underline-offset-2 hover:underline">
              View run
            </Link>
          ) : null}
        </div>
      ),
      hideOnMobile: true,
    },
  ]
}

export function QualityTab({ model, workspaceId }: { model: DataModel; workspaceId: string }) {
  const query = useModelQualityChecks(model.id)
  const [status, setStatus] = useState('all')
  const columns = useMemo(() => buildColumns(workspaceId), [workspaceId])
  const rows = useMemo(() => (query.data ?? []).filter((c) => status === 'all' || c.status === status), [query.data, status])

  if (query.isPending) return <TableSkeleton rows={5} columns={5} />
  if (query.isError) return <ErrorState error={query.error} title="Could not load quality checks" onRetry={() => query.refetch()} />
  if (!query.data.length) {
    return (
      <EmptyState
        compact
        icon={ShieldCheck}
        title="No quality checks on this table"
        description={
          model.transformation_id
            ? 'Add dbt tests (unique, not_null, relationships) to the transformation that builds this model.'
            : 'Bronze tables are tested downstream; add checks to the Silver staging model that reads this table.'
        }
        action={
          model.transformation_id ? (
            <Button variant="outline" size="sm" asChild>
              <Link to={wsPath(workspaceId, 'transformations', model.transformation_id)}>Open transformation</Link>
            </Button>
          ) : undefined
        }
      />
    )
  }

  const counts = STATUS_OPTIONS.map((o) => ({ ...o, count: query.data.filter((c) => c.status === o.value).length }))
  return (
    <div>
      <TableToolbar>
        <FilterSelect label="Statuses" value={status} onChange={setStatus} options={counts.map((c) => ({ value: c.value, label: `${c.label} (${c.count})` }))} />
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:ml-auto">
          Checks run as dbt tests after each transformation.
          <HelpTip label="About severity">Error-severity failures stop downstream models from refreshing in a pipeline. Warn-severity failures are reported but do not block.</HelpTip>
        </p>
      </TableToolbar>
      <DataTable columns={columns} rows={rows} getRowId={(c) => c.id} caption="Quality checks" className="overflow-x-auto" />
    </div>
  )
}
