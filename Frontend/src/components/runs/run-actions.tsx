import { useMutation, useQueryClient } from '@tanstack/react-query'
import { RotateCw, Square } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import { runsService } from '@/services/runs.service'
import type { Run } from '@/types'
import { DisabledReason } from './disabled-reason'
import { RUN_KIND_LABELS, runPermissionFor } from './labels'
import { runAffectedPrefixes } from './use-run-settled'
import { runKeys } from './use-run'

function useInvalidateRun() {
  const queryClient = useQueryClient()
  return (run: Run) => Promise.all(['runs', ...runAffectedPrefixes(run.kind)].map((prefix) => queryClient.invalidateQueries({ queryKey: [prefix] })))
}

/**
 * Retry (failed or cancelled runs) and Cancel (queued or running runs), both
 * confirmed first. Permission depends on the run kind. A successful retry
 * navigates to the new run.
 */
export function RunActions({ run, size = 'sm', navigateOnRetry = true }: { run: Run; size?: 'sm' | 'default'; navigateOnRetry?: boolean }) {
  const { workspaceId } = useWorkspace()
  const permission = runPermissionFor(run.kind)
  const allowed = usePermission(permission)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const invalidate = useInvalidateRun()
  const [confirm, setConfirm] = useState<'retry' | 'cancel' | null>(null)

  const retry = useMutation({
    mutationFn: () => runsService.retry(run.id),
    onSuccess: async (created) => {
      queryClient.setQueryData(runKeys.detail(created.id), created)
      toastSuccess('Retry queued', `Attempt ${created.attempt} of ${run.target_name} is queued as ${created.id}.`)
      await invalidate(run)
      if (navigateOnRetry) navigate(wsPath(workspaceId, 'runs', created.id))
    },
    onError: (error) => toastError(error, 'Could not retry the run'),
  })

  const cancel = useMutation({
    mutationFn: () => runsService.cancel(run.id),
    onSuccess: async (updated) => {
      queryClient.setQueryData(runKeys.detail(updated.id), updated)
      toastSuccess('Cancellation requested', `${run.target_name} will stop after the current step.`)
      await invalidate(run)
    },
    onError: (error) => toastError(error, 'Could not cancel the run'),
  })

  const canRetry = run.status === 'failed' || run.status === 'cancelled'
  const canCancel = run.status === 'queued' || run.status === 'running'
  if (!canRetry && !canCancel) return null

  const permissionReason = allowed ? null : `Your role does not include the "${permission}" permission.`
  const retryReason =
    permissionReason ??
    (run.error && !run.error.retryable ? `This failure needs a fix before it can be retried.${run.error.details ? ` ${run.error.details}` : ' Fix the cause, then trigger a new run.'}` : null)

  return (
    <>
      {canRetry ? (
        <DisabledReason reason={retryReason}>
          <Button size={size} variant="outline" disabled={Boolean(retryReason)} loading={retry.isPending} onClick={() => setConfirm('retry')}>
            {!retry.isPending ? <RotateCw aria-hidden /> : null}
            Retry
          </Button>
        </DisabledReason>
      ) : null}
      {canCancel ? (
        <DisabledReason reason={permissionReason}>
          <Button size={size} variant="outline" disabled={Boolean(permissionReason)} loading={cancel.isPending} onClick={() => setConfirm('cancel')}>
            {!cancel.isPending ? <Square aria-hidden /> : null}
            Cancel run
          </Button>
        </DisabledReason>
      ) : null}

      <ConfirmDialog
        open={confirm === 'retry'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={`Retry ${RUN_KIND_LABELS[run.kind].toLowerCase()}?`}
        description={`A new attempt (${run.attempt + 1}) of "${run.target_name}" will be queued with the same configuration. The original run ${run.id} is kept for reference.`}
        confirmLabel="Retry run"
        onConfirm={() => retry.mutateAsync()}
      />
      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title="Cancel this run?"
        description={`"${run.target_name}" stops after the current step. Stages that have not started are marked cancelled, and data already loaded is not rolled back.`}
        confirmLabel="Cancel run"
        destructive
        onConfirm={() => cancel.mutateAsync()}
      />
    </>
  )
}
