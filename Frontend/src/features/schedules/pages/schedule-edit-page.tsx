import { CalendarX } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import { toastSuccess } from '@/lib/toast'
import { isApiError } from '@/services/api-error'
import { ScheduleForm } from '../components/schedule-form'
import { WriteAccessNotice } from '../components/write-access-notice'
import { useSchedule, useUpdateSchedule } from '../queries'

export default function ScheduleEditPage() {
  const { scheduleId = '' } = useParams()
  const { workspace, workspaceId } = useWorkspace()
  const canWrite = usePermission('schedules:write')
  const navigate = useNavigate()
  const schedule = useSchedule(scheduleId)
  const update = useUpdateSchedule(scheduleId)
  const listPath = wsPath(workspaceId, 'schedules')
  const detailPath = wsPath(workspaceId, 'schedules', scheduleId)
  const name = schedule.data?.name ?? 'Schedule'
  const breadcrumbs = [{ label: 'Schedules', to: listPath }, { label: name, to: schedule.data ? detailPath : undefined }, { label: 'Edit' }]

  const body = () => {
    if (schedule.isLoading) {
      return (
        <div className="space-y-4" aria-busy="true" aria-label="Loading schedule">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )
    }
    const notFound = (
      <EmptyState
        icon={CalendarX}
        title="This schedule does not exist"
        description="It may have been deleted, or the link points to another workspace."
        action={
          <Button asChild variant="outline">
            <Link to={listPath}>Back to schedules</Link>
          </Button>
        }
      />
    )
    if (schedule.isError) {
      if (isApiError(schedule.error) && schedule.error.status === 404) return notFound
      return <ErrorState error={schedule.error} title="Could not load this schedule" onRetry={() => void schedule.refetch()} />
    }
    if (schedule.data!.workspace_id !== workspaceId) return notFound
    if (!canWrite) return <WriteAccessNotice backTo={detailPath} backLabel="Back to schedule" />
    return (
      <ScheduleForm
        // Remount when switching schedules so default values reset.
        key={schedule.data!.id}
        initial={schedule.data!}
        defaults={{ timezone: workspace.timezone }}
        submitLabel="Save changes"
        onCancel={() => navigate(detailPath)}
        onSubmit={async (payload) => {
          const saved = await update.mutateAsync(payload)
          toastSuccess('Schedule saved', `"${saved.name}" was updated.`)
          navigate(detailPath)
        }}
      />
    )
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title={schedule.data ? `Edit ${name}` : 'Edit schedule'} breadcrumbs={breadcrumbs} />
      {body()}
    </div>
  )
}
