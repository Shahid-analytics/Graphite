import { Eye, History, MoreHorizontal, Pause, Play, PlayCircle } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePermission, wsPath } from '@/hooks/use-workspace'
import type { Pipeline } from '@/types'
import { runBlockedReason, statusToggle } from '../lib/pipeline-state'
import { useRunPipelineAction, useTogglePipelineStatus } from '../lib/use-pipeline-actions'

/** Disabled menu item with its reason rendered underneath, so it is readable without hover. */
function Reason({ children }: { children: string | null }) {
  if (!children) return null
  return <span className="block text-[11px] leading-4 text-muted-foreground">{children}</span>
}

export function PipelineRowActions({ pipeline, workspaceId }: { pipeline: Pipeline; workspaceId: string }) {
  const navigate = useNavigate()
  const canRun = usePermission('pipelines:run')
  const canWrite = usePermission('pipelines:write')
  const runner = useRunPipelineAction()
  const statusAction = useTogglePipelineStatus()
  const runReason = runBlockedReason(pipeline, canRun)
  const toggle = statusToggle(pipeline)
  const writeReason = canWrite ? null : 'Requires the "pipelines:write" permission.'

  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${pipeline.name}`}>
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="truncate">{pipeline.name}</DropdownMenuLabel>
          <DropdownMenuItem disabled={Boolean(runReason) || runner.isPending} onSelect={() => void runner.run(pipeline)} className="items-start">
            <PlayCircle aria-hidden className="mt-0.5" />
            <span>
              Run now
              <Reason>{runReason}</Reason>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canWrite || statusAction.isPending} onSelect={() => void statusAction.toggle(pipeline)} className="items-start">
            {toggle.next === 'paused' ? <Pause aria-hidden className="mt-0.5" /> : <Play aria-hidden className="mt-0.5" />}
            <span>
              {toggle.label}
              <Reason>{writeReason}</Reason>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate(wsPath(workspaceId, 'pipelines', pipeline.id))}>
            <Eye aria-hidden />
            View pipeline
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!pipeline.last_run} onSelect={() => pipeline.last_run && navigate(wsPath(workspaceId, 'runs', pipeline.last_run.id))}>
            <History aria-hidden />
            {pipeline.last_run ? 'View last run' : 'No runs yet'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
