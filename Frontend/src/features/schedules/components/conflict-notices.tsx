import { Loader2 } from 'lucide-react'
import { Link } from 'react-router'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { errorMessage } from '@/services/api-error'
import type { ScheduleConflict, ValidateScheduleResponse } from '@/types'

const TITLES: Record<ScheduleConflict['kind'], string> = {
  same_target: 'Another schedule already runs this target',
  shared_source: 'Runs close to another schedule on the same source',
  overlapping_window: 'Consecutive runs may overlap',
}

/** Result of the server-side conflict check. Conflicts are warnings; saving remains possible. */
export function ConflictNotices({
  result,
  isFetching,
  error,
  onRetry,
  currentScheduleId,
  idle,
}: {
  result: ValidateScheduleResponse | undefined
  isFetching: boolean
  error: unknown
  onRetry: () => void
  currentScheduleId?: string
  /** True while there is nothing to check yet (no target or invalid cron). */
  idle: boolean
}) {
  const { workspaceId } = useWorkspace()

  if (idle) {
    return <p className="text-xs text-muted-foreground">Select a target and a valid cadence to check for conflicts with other schedules.</p>
  }

  return (
    <div className="space-y-2" aria-live="polite">
      {isFetching ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Checking for conflicts with other schedules
        </p>
      ) : null}
      {error && !isFetching ? (
        <Notice
          tone="neutral"
          title="Conflict check unavailable"
          action={
            <Button variant="outline" size="sm" type="button" onClick={onRetry}>
              Retry
            </Button>
          }
        >
          {errorMessage(error)} You can still save; the backend validates the schedule again.
        </Notice>
      ) : null}
      {result?.errors.length ? (
        <Notice tone="danger" title="The server rejected this cadence">
          <ul className="list-disc pl-4">
            {result.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      {result?.conflicts.map((conflict, index) => {
        const linkable = conflict.schedule_id && conflict.schedule_id !== currentScheduleId && conflict.kind !== 'overlapping_window'
        return (
          <Notice
            key={`${conflict.kind}-${conflict.schedule_id}-${index}`}
            tone="warning"
            title={TITLES[conflict.kind]}
            action={
              linkable ? (
                <Link
                  to={wsPath(workspaceId, 'schedules', conflict.schedule_id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium whitespace-nowrap underline-offset-4 hover:underline"
                >
                  Open {conflict.schedule_name}
                </Link>
              ) : undefined
            }
          >
            {conflict.message}
          </Notice>
        )
      })}
      {result && !result.errors.length && result.conflicts.length ? (
        <p className="text-xs text-muted-foreground">
          You can still save. At run time the backend scheduler applies the overlap policy and orders runs that depend on the same source.
        </p>
      ) : null}
      {result && !isFetching && !error && !result.errors.length && !result.conflicts.length ? (
        <p className="text-xs text-muted-foreground">No conflicts with other enabled schedules.</p>
      ) : null}
    </div>
  )
}
