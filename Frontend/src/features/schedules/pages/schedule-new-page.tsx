import { useNavigate, useSearchParams } from 'react-router'
import { PageHeader } from '@/components/layout/page-header'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { toastSuccess } from '@/lib/toast'
import type { ScheduleTargetType } from '@/types'
import { ScheduleForm } from '../components/schedule-form'
import { WriteAccessNotice } from '../components/write-access-notice'
import { TARGET_TYPES } from '../lib/schedule-utils'
import { useCreateSchedule } from '../queries'

export default function ScheduleNewPage() {
  const { workspace, workspaceId } = useWorkspace()
  const canWrite = usePermission('schedules:write')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const create = useCreateSchedule(workspaceId)
  const listPath = wsPath(workspaceId, 'schedules')

  // Allows other pages to link here with a target preselected, e.g. ?target_type=pipeline&target_id=pl_sales.
  const requestedType = params.get('target_type')
  const targetType = TARGET_TYPES.includes(requestedType as ScheduleTargetType) ? (requestedType as ScheduleTargetType) : undefined
  const targetId = targetType ? (params.get('target_id') ?? undefined) : undefined

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Create schedule"
        description="Run a pipeline, source sync or dbt transformation automatically on a recurring cadence."
        breadcrumbs={[{ label: 'Schedules', to: listPath }, { label: 'New schedule' }]}
      />
      {canWrite ? (
        <ScheduleForm
          defaults={{ timezone: workspace.timezone, target_type: targetType, target_id: targetId }}
          submitLabel="Create schedule"
          onCancel={() => navigate(listPath)}
          onSubmit={async (payload) => {
            const schedule = await create.mutateAsync(payload)
            toastSuccess(
              'Schedule created',
              schedule.enabled ? `"${schedule.name}" will trigger ${schedule.target_name}.` : `"${schedule.name}" is saved but disabled.`,
            )
            navigate(wsPath(workspaceId, 'schedules', schedule.id))
          }}
        />
      ) : (
        <WriteAccessNotice backTo={listPath} backLabel="Back to schedules" />
      )}
    </div>
  )
}
