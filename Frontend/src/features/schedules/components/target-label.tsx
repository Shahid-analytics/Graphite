import { Link } from 'react-router'
import { useWorkspace } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { Schedule } from '@/types'
import { TARGET_META, targetPath } from '../lib/schedule-utils'

/** Target type icon and name, linking to the target's page. */
export function TargetLabel({
  schedule,
  showType = false,
  className,
}: {
  schedule: Pick<Schedule, 'target_type' | 'target_id' | 'target_name'>
  showType?: boolean
  className?: string
}) {
  const { workspaceId } = useWorkspace()
  const meta = TARGET_META[schedule.target_type]
  const Icon = meta.icon
  const to = targetPath(workspaceId, schedule)
  const name = <span className="truncate">{schedule.target_name}</span>
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={meta.label} />
      {to ? (
        <Link to={to} className="min-w-0 truncate rounded-sm hover:underline">
          {name}
        </Link>
      ) : (
        name
      )}
      {showType ? <span className="shrink-0 text-xs text-muted-foreground">{meta.label}</span> : null}
    </span>
  )
}
