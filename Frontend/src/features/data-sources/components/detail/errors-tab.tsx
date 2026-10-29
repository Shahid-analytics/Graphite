import { ArrowUpRight, CheckCircle2, Lightbulb } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { TimeAgo } from '@/components/data/display'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { Pagination } from '@/components/tables/data-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import type { Run } from '@/types'
import { useSourceRuns } from '../../queries'
import { GatedButton } from '../primitives'
import { guidanceFor, runLabel, RunRowAction, TRIGGER_LABELS } from './run-helpers'

const PAGE_SIZE = 10

function ErrorCard({
  run,
  onRetried,
  onOpenSettings,
  onTest,
  testReason,
}: {
  run: Run
  onRetried: (run: Run) => void
  onOpenSettings: () => void
  onTest: () => void
  testReason: string | null
}) {
  const { workspaceId } = useWorkspace()
  const error = run.error
  const stage = error?.stage ? (run.stages.find((s) => s.key === error.stage)?.name ?? error.stage) : null
  const guidance = guidanceFor(error?.code ?? '')
  return (
    <li className="rounded-lg border border-border bg-background shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="danger" className="font-mono">
              {error?.code ?? 'unknown_error'}
            </Badge>
            {stage ? <span className="text-xs text-muted-foreground">at {stage}</span> : null}
            {error && !error.retryable ? <Badge variant="outline">Not retryable</Badge> : null}
          </div>
          <p className="mt-1.5 text-sm font-medium">{error?.message ?? 'The run failed without an error message.'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {runLabel(run)} · {TRIGGER_LABELS[run.trigger]}
            {run.attempt > 1 ? ` · attempt ${run.attempt}` : ''} · <TimeAgo value={run.finished_at ?? run.queued_at} />
          </p>
        </div>
        <div className="flex items-center gap-1">
          <RunRowAction run={run} onRetried={onRetried} />
          <Button asChild variant="outline" size="sm">
            <Link to={wsPath(workspaceId, 'runs', run.id)}>
              Logs
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        {error?.details ? <pre className="scrollbar-thin overflow-x-auto rounded-md bg-surface px-3 py-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">{error.details}</pre> : null}
        <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-start">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="flex-1 text-muted-foreground">{guidance.text}</p>
          {guidance.action === 'settings' ? (
            <Button variant="outline" size="sm" onClick={onOpenSettings}>
              Update credentials
            </Button>
          ) : guidance.action === 'test' ? (
            <GatedButton variant="outline" size="sm" reason={testReason} onClick={onTest}>
              Test connection
            </GatedButton>
          ) : guidance.action === 'transformations' ? (
            <Button asChild variant="outline" size="sm">
              <Link to={wsPath(workspaceId, 'transformations')}>Open transformations</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

export function ErrorsTab({
  sourceId,
  onRunStarted,
  onOpenSettings,
  onTest,
  testReason,
}: {
  sourceId: string
  onRunStarted: (run: Run) => void
  onOpenSettings: () => void
  onTest: () => void
  testReason: string | null
}) {
  const [page, setPage] = useState(1)
  const { data, isLoading, error, refetch } = useSourceRuns(sourceId, { status: 'failed', page, page_size: PAGE_SIZE })

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true" aria-label="Loading errors">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    )
  }
  if (error) return <ErrorState error={error} title="Could not load failed runs" onRetry={() => void refetch()} />
  if (!data?.items.length) {
    return <EmptyState icon={CheckCircle2} title="No failed runs" description="Every sync and pipeline run for this source has completed without errors." />
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {data.total} failed run{data.total === 1 ? '' : 's'}, newest first. Each failure shows the stage, the error returned and what to do next.
      </p>
      <ul className="space-y-3">
        {data.items.map((run) => (
          <ErrorCard key={run.id} run={run} onRetried={onRunStarted} onOpenSettings={onOpenSettings} onTest={onTest} testReason={testReason} />
        ))}
      </ul>
      {data.total > PAGE_SIZE ? (
        <div className="rounded-lg border border-border">
          <Pagination page={data.page} totalPages={Math.ceil(data.total / PAGE_SIZE)} total={data.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </div>
      ) : null}
    </div>
  )
}
