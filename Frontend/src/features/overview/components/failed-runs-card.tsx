import { CheckCircle2, RotateCw, XCircle } from 'lucide-react'
import { useState } from 'react'
import { TimeAgo } from '@/components/data/display'
import { EmptyState } from '@/components/feedback/states'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermission, wsPath } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import { errorMessage, isApiError } from '@/services/api-error'
import type { RunKind, RunSummary } from '@/types'
import { retryPermissionFor, useRetryRun, type RetryPermission } from '../queries'
import { RUN_KIND_LABELS } from './labels'
import { CardLink, MetaDot, OverviewCard, PanelList, RowLink } from './overview-card'

const PERMISSION_REASON: Record<RetryPermission, string> = {
  'sources:sync': 'Retrying a source sync requires permission to sync sources.',
  'pipelines:run': 'Retrying a pipeline run requires permission to run pipelines.',
  'transformations:run': 'Retrying dbt runs, dbt tests and schema applies requires permission to run transformations.',
}

/** Refusals that stay true until something else changes, so the button stays disabled with the server's reason. */
const NOT_RETRYABLE_CODES = ['run_not_retryable', 'pipeline_not_runnable']

const NOT_RETRYABLE_REASON = 'This failure needs a fix before it can be retried. Open the run for details, fix the cause, then trigger a new run.'

/** Where the new attempt shows up on this page, so the toast points the user to it. */
function followUpHint(kind: RunKind) {
  return kind === 'pipeline' || kind === 'ingestion' ? 'Follow it in recent pipeline runs.' : 'Follow it in recent transformation activity.'
}

function DisabledRetry({ label, reason }: { label: string; reason: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="button" aria-disabled="true" tabIndex={0} className="inline-flex rounded-md" aria-label={`${label} (unavailable)`}>
          <Button variant="outline" size="sm" disabled aria-hidden>
            <RotateCw aria-hidden />
            Retry
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  )
}

function RetryButton({ run }: { run: RunSummary }) {
  const permission = retryPermissionFor(run.kind)
  const allowed = usePermission(permission)
  const retry = useRetryRun()
  // Set when the server refuses the retry for a reason the summary cannot show up front
  // (for example a paused pipeline or a run already in progress).
  const [notRetryable, setNotRetryable] = useState<string | null>(null)
  const label = `Retry ${run.target_name}`

  if (!allowed) return <DisabledRetry label={label} reason={PERMISSION_REASON[permission]} />
  if (run.retryable === false) return <DisabledRetry label={label} reason={NOT_RETRYABLE_REASON} />
  if (notRetryable) return <DisabledRetry label={label} reason={notRetryable} />

  return (
    <Button
      variant="outline"
      size="sm"
      aria-label={label}
      loading={retry.isPending}
      onClick={() =>
        retry.mutate(run, {
          onSuccess: (created) => toastSuccess('Retry started', `${created.target_name}, attempt ${created.attempt} is queued. ${followUpHint(created.kind)}`),
          onError: (error) => {
            if (isApiError(error) && NOT_RETRYABLE_CODES.includes(error.code)) setNotRetryable(errorMessage(error))
            toastError(error, 'Could not retry the run')
          },
        })
      }
    >
      {retry.isPending ? null : <RotateCw aria-hidden />}
      Retry
    </Button>
  )
}

export function FailedRunsCard({ runs, workspaceId, className }: { runs: RunSummary[]; workspaceId: string; className?: string }) {
  return (
    <OverviewCard
      title="Failed executions"
      description="Failures in the last 7 days, most recent first."
      className={className}
      action={runs.length ? <CardLink to={wsPath(workspaceId, 'pipelines')}>Pipelines</CardLink> : undefined}
    >
      {runs.length ? (
        <PanelList label="Failed executions">
          {runs.map((run) => (
            <li key={run.id} className="flex gap-3 py-3">
              <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Failed" />
              <div className="min-w-0 flex-1 space-y-1">
                <RowLink to={wsPath(workspaceId, 'runs', run.id)} className="block truncate text-sm font-medium">
                  {run.target_name}
                </RowLink>
                <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  {RUN_KIND_LABELS[run.kind]}
                  <MetaDot />
                  <TimeAgo value={run.finished_at ?? run.queued_at} />
                  {run.attempt > 1 ? (
                    <>
                      <MetaDot />
                      attempt {run.attempt}
                    </>
                  ) : null}
                </p>
                {run.error_message ? (
                  <p className="line-clamp-2 rounded-sm border-l-2 border-danger/40 pl-2 text-xs text-muted-foreground" title={run.error_message}>
                    {run.error_message}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0">
                <RetryButton run={run} />
              </div>
            </li>
          ))}
        </PanelList>
      ) : (
        <EmptyState
          compact
          icon={CheckCircle2}
          title="No failures in the last 7 days"
          description="Failed syncs, pipeline runs and dbt runs are listed here with a retry action."
        />
      )}
    </OverviewCard>
  )
}
