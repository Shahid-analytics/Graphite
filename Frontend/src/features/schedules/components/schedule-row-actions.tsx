import { Eye, MoreHorizontal, Pencil, Play, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePermission, useWorkspace, wsPath } from '@/hooks/use-workspace'
import type { Schedule } from '@/types'
import { runPermissionFor } from '../lib/schedule-utils'
import { DeleteScheduleDialog } from './delete-schedule-dialog'
import { useRunNow } from './use-run-now'

export function ScheduleRowActions({ schedule }: { schedule: Schedule }) {
  const { workspace, workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const canWrite = usePermission('schedules:write')
  const runPermission = runPermissionFor(schedule.target_type)
  const canRun = usePermission(runPermission)
  const { runNow, isPending } = useRunNow()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const restrictions = [
    !canRun ? `run this target ("${runPermission}")` : null,
    !canWrite ? 'edit or delete schedules ("schedules:write")' : null,
  ].filter(Boolean)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${schedule.name}`}>
            <MoreHorizontal className="size-4" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => navigate(wsPath(workspaceId, 'schedules', schedule.id))}>
            <Eye aria-hidden />
            View details
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canRun || isPending} onSelect={() => void runNow(schedule)}>
            <Play aria-hidden />
            Run now
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canWrite} onSelect={() => navigate(wsPath(workspaceId, 'schedules', schedule.id, 'edit'))}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={!canWrite} onSelect={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
          {restrictions.length ? (
            <>
              <DropdownMenuSeparator />
              <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
                Your role ({workspace.current_user_role}) cannot {restrictions.join(' or ')}.
              </p>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteScheduleDialog schedule={schedule} open={confirmOpen} onOpenChange={setConfirmOpen} />
    </>
  )
}
