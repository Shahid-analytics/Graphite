import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { isMockMode } from '@/lib/config'
import { toastError } from '@/lib/toast'
import type { Run, Schedule } from '@/types'
import { useRunScheduleNow } from '../queries'

/** Triggers a schedule's target immediately and reports the queued run with a link to it. */
export function useRunNow(onQueued?: (run: Run) => void) {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const mutation = useRunScheduleNow()

  const runNow = (schedule: Schedule) =>
    mutation.mutateAsync(schedule).then(
      (run) => {
        toast.success(`Run queued for ${run.target_name}`, {
          description: isMockMode ? `Simulated run ${run.id}. No real pipeline is executed in demo mode.` : `Run ${run.id} was queued by the scheduler.`,
          action: { label: 'View run', onClick: () => navigate(wsPath(workspaceId, 'runs', run.id)) },
        })
        onQueued?.(run)
        return run
      },
      (error: unknown) => {
        toastError(error, 'Could not start the run')
        return null
      },
    )

  return { runNow, isPending: mutation.isPending, pendingId: mutation.isPending ? mutation.variables?.id : undefined }
}
