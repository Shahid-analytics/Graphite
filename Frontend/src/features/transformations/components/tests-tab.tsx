import { FlaskConical, ShieldCheck } from 'lucide-react'
import { TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TestResult } from '@/types'
import { TEST_STATUS, TEST_TYPE_LABELS } from '../lib/labels'
import { useTransformationTests } from '../queries'

const STATUS_RANK: Record<TestResult['status'], number> = { failed: 0, warning: 1, not_run: 2, passed: 3 }

const COLUMNS: Column<TestResult>[] = [
  {
    id: 'name',
    header: 'Test',
    sortValue: (t) => t.name,
    cell: (t) => (
      <div className="min-w-0">
        <p className="font-mono text-[13px] font-medium break-all">{t.name}</p>
        <p className="text-xs text-muted-foreground">
          {TEST_TYPE_LABELS[t.test_type] ?? t.test_type}
          {t.column ? (
            <>
              {' '}
              on <span className="font-mono">{t.column}</span>
            </>
          ) : (
            ' on the model'
          )}
        </p>
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    sortValue: (t) => STATUS_RANK[t.status],
    cell: (t) => <Badge variant={TEST_STATUS[t.status].variant}>{TEST_STATUS[t.status].label}</Badge>,
  },
  {
    id: 'failing_rows',
    header: 'Failing rows',
    sortValue: (t) => t.failing_rows,
    cell: (t) => (
      <span className={cn('text-sm tabular', t.failing_rows ? 'font-medium text-foreground' : 'text-subtle-foreground')}>
        {formatNumber(t.failing_rows)}
      </span>
    ),
  },
  {
    id: 'message',
    header: 'Message',
    hideOnMobile: true,
    cell: (t) => (t.message ? <p className="max-w-md text-sm text-muted-foreground">{t.message}</p> : <span className="text-xs text-subtle-foreground">—</span>),
  },
  { id: 'last_run', header: 'Last run', sortValue: (t) => t.last_run_at, hideOnMobile: true, cell: (t) => <TimeAgo value={t.last_run_at} className="text-sm" /> },
]

export function TestsTab({ transformationId }: { transformationId: string }) {
  const query = useTransformationTests(transformationId)
  if (query.isPending) return <TableSkeleton rows={4} columns={5} />
  if (query.isError) return <ErrorState error={query.error} title="Could not load test results" onRetry={() => query.refetch()} />

  const tests = query.data
  if (!tests.length) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="No tests defined"
        description="Add unique, not_null, relationships or accepted_values tests to this model's schema.yml in the dbt repository. Tests run after each build and gate the Gold layer."
      />
    )
  }

  const count = (status: TestResult['status']) => tests.filter((t) => t.status === status).length
  const failed = count('failed')
  const warned = count('warning')
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
          {tests.length} tests
        </span>
        <span className="text-muted-foreground">{count('passed')} passed</span>
        <span className={failed ? 'font-medium text-danger' : 'text-muted-foreground'}>{failed} failed</span>
        <span className={warned ? 'font-medium text-warning' : 'text-muted-foreground'}>{warned} warnings</span>
        {count('not_run') ? <span className="text-muted-foreground">{count('not_run')} not run</span> : null}
      </div>
      {failed ? (
        <Notice tone="danger" title={`${failed} error-severity ${failed === 1 ? 'test is' : 'tests are'} failing`}>
          Pipelines that include this model stop at the data quality stage, and downstream Gold models and Metabase refreshes are skipped
          until the data or the model is fixed.
        </Notice>
      ) : null}
      <DataTable caption="Test results" columns={COLUMNS} rows={tests} getRowId={(t) => t.id} pageSize={20} />
    </div>
  )
}
