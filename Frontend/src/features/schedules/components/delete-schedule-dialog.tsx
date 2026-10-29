import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { toastError, toastSuccess } from '@/lib/toast'
import type { Schedule } from '@/types'
import { useDeleteSchedule } from '../queries'

export function DeleteScheduleDialog({
  schedule,
  open,
  onOpenChange,
  onDeleted,
}: {
  schedule: Schedule
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const remove = useDeleteSchedule()
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      destructive
      title={`Delete "${schedule.name}"?`}
      description={
        <>
          The scheduler will stop triggering {schedule.target_name} on this cadence. Runs already in progress are not cancelled, and past
          executions stay in run history and the audit trail.
          {schedule.target_type === 'source_sync' ? ' If no other enabled schedule syncs this source, its sync frequency becomes manual.' : ''}
        </>
      }
      confirmLabel="Delete schedule"
      onConfirm={async () => {
        try {
          await remove.mutateAsync(schedule)
          toastSuccess('Schedule deleted', `"${schedule.name}" no longer triggers ${schedule.target_name}.`)
          onDeleted?.()
        } catch (error) {
          toastError(error, 'Could not delete the schedule')
          throw error
        }
      }}
    />
  )
}
