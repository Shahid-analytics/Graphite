import { Switch } from '@/components/ui/switch'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { formatRelative } from '@/lib/format'
import { toastError, toastSuccess } from '@/lib/toast'
import type { Schedule } from '@/types'
import { useToggleSchedule } from '../queries'
import { Gated, permissionReason } from './gated'

/** Inline enable/disable toggle. Optimistic; rolls back and reports on failure. */
export function ScheduleEnabledSwitch({ schedule, withLabel = false }: { schedule: Schedule; withLabel?: boolean }) {
  const { workspaceId } = useWorkspace()
  const canWrite = usePermission('schedules:write')
  const toggle = useToggleSchedule(workspaceId)
  const id = `schedule-enabled-${schedule.id}`

  const onChange = (enabled: boolean) => {
    toggle.mutate(
      { schedule, enabled },
      {
        onSuccess: (updated) =>
          toastSuccess(
            enabled ? `"${updated.name}" enabled` : `"${updated.name}" disabled`,
            enabled
              ? updated.next_run_at
                ? `Next run ${formatRelative(updated.next_run_at)}.`
                : undefined
              : 'The scheduler will not trigger new runs until it is enabled again.',
          ),
        onError: (error) => toastError(error, enabled ? 'Could not enable the schedule' : 'Could not disable the schedule'),
      },
    )
  }

  const control = (
    <Switch
      id={id}
      checked={schedule.enabled}
      onCheckedChange={onChange}
      disabled={!canWrite || toggle.isPending}
      aria-label={withLabel ? undefined : `${schedule.name}: ${schedule.enabled ? 'enabled' : 'disabled'}`}
    />
  )

  return (
    <Gated allowed={canWrite} reason={permissionReason('schedules:write')}>
      {withLabel ? (
        <span className="inline-flex items-center gap-2">
          {control}
          <label htmlFor={id} className="text-sm">
            {schedule.enabled ? 'Enabled' : 'Disabled'}
          </label>
        </span>
      ) : (
        control
      )}
    </Gated>
  )
}
