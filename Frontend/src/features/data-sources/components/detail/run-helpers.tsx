import { RotateCw, Square } from 'lucide-react'
import { useWorkspace } from '@/hooks/use-workspace'
import { toastError, toastInfo, toastSuccess } from '@/lib/toast'
import { isTerminal, type Permission, type Run, type RunTrigger } from '@/types'
import { useCancelSourceRun, useRetrySourceRun } from '../../queries'
import { GatedButton, permissionReason } from '../primitives'

export const TRIGGER_LABELS: Record<RunTrigger, string> = {
  manual: 'Manual',
  schedule: 'Scheduled',
  retry: 'Retry',
  onboarding: 'Onboarding',
  api: 'API',
}

export function runLabel(run: Run) {
  return run.kind === 'ingestion' ? 'Source sync' : `Pipeline: ${run.target_name}`
}

export function runPermission(run: Run): Permission {
  return run.kind === 'ingestion' ? 'sources:sync' : 'pipelines:run'
}

export interface Guidance {
  text: string
  action?: 'settings' | 'transformations' | 'test'
}

/** What to do about a failure, by error code. */
export function guidanceFor(code: string): Guidance {
  switch (code) {
    case 'source_auth_failed':
      return { text: 'The source rejected the stored credentials. Replace the password or secret in Settings, test the connection, then retry the run.', action: 'settings' }
    case 'source_unreachable':
      return { text: 'Graphite could not reach the source. Check the host and port, and make sure the firewall allows connections from the Graphite egress IP addresses.', action: 'test' }
    case 'source_rate_limited':
      return { text: 'The source API limit was reached. The next scheduled run resumes from the saved cursor. If this repeats, sync less often or fewer objects.' }
    case 'dbt_model_error':
      return { text: 'Ingestion succeeded and Bronze was loaded, but a dbt model failed afterwards. Fix the model in Transformations; retrying without a fix fails again.', action: 'transformations' }
    case 'quality_checks_failed':
      return { text: 'Data loaded but quality checks failed, so downstream models were not published. Review the failing tests in the run and the affected model.' }
    default:
      return { text: 'Open the run logs for details. Retry if the cause was temporary.' }
  }
}

/** Retry (failed or cancelled) or cancel (active) control for one run. */
export function RunRowAction({ run, onRetried }: { run: Run; onRetried?: (run: Run) => void }) {
  const { workspace } = useWorkspace()
  const retry = useRetrySourceRun()
  const cancel = useCancelSourceRun()
  const permission = runPermission(run)
  const allowed = workspace.permissions.includes(permission)

  if (!isTerminal(run.status)) {
    return (
      <GatedButton
        variant="ghost"
        size="sm"
        reason={allowed ? null : permissionReason(permission)}
        loading={cancel.isPending}
        onClick={(e) => {
          e.stopPropagation()
          cancel.mutate(run, {
            onSuccess: () => toastInfo('Cancellation requested', `${runLabel(run)} stops after the current step.`),
            onError: (error) => toastError(error, 'Could not cancel the run'),
          })
        }}
      >
        <Square className="size-3.5" aria-hidden />
        Cancel
      </GatedButton>
    )
  }
  if (run.status !== 'failed' && run.status !== 'cancelled') return null
  const notRetryable = run.error && !run.error.retryable ? 'This failure is not retryable. Fix the underlying issue and start a new run.' : null
  return (
    <GatedButton
      variant="ghost"
      size="sm"
      reason={allowed ? notRetryable : permissionReason(permission)}
      loading={retry.isPending}
      onClick={(e) => {
        e.stopPropagation()
        retry.mutate(run, {
          onSuccess: (created) => {
            toastSuccess('Retry queued', `Attempt ${created.attempt} of ${runLabel(run).toLowerCase()} (run ${created.id}).`)
            onRetried?.(created)
          },
          onError: (error) => toastError(error, 'Could not retry the run'),
        })
      }}
    >
      <RotateCw className="size-3.5" aria-hidden />
      Retry
    </GatedButton>
  )
}
