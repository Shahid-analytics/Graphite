import { MoreHorizontal, Pause, Play, PlugZap, RefreshCw, Settings2, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import type { Source } from '@/types'
import { MenuItemLabel } from './primitives'
import { useSourceActionState, type useSourceActions } from './source-actions'

/** Per-row actions menu for the connections table. */
export function SourceRowMenu({ source, actions }: { source: Source; actions: ReturnType<typeof useSourceActions> }) {
  const { workspaceId } = useWorkspace()
  const navigate = useNavigate()
  const { syncReason, writeReason, testReason } = useSourceActionState(source)
  const paused = source.status === 'paused'
  const pauseReason = writeReason ?? (source.status === 'draft' ? 'Draft sources cannot be paused or resumed.' : null)

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${source.name}`} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <DropdownMenuItem disabled={Boolean(syncReason)} onSelect={() => actions.startSync(source)}>
          <RefreshCw aria-hidden />
          <MenuItemLabel reason={syncReason}>Sync now</MenuItemLabel>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={Boolean(testReason)} onSelect={() => actions.openTest(source)}>
          <PlugZap aria-hidden />
          <MenuItemLabel reason={testReason}>Test connection</MenuItemLabel>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={Boolean(pauseReason)} onSelect={() => actions.togglePause(source)}>
          {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
          <MenuItemLabel reason={pauseReason}>{paused ? 'Resume' : 'Pause'}</MenuItemLabel>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`${wsPath(workspaceId, 'sources', source.id)}?tab=settings`)}>
          <Settings2 aria-hidden />
          <MenuItemLabel reason={writeReason ? 'View only for your role.' : null}>Edit settings</MenuItemLabel>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" disabled={Boolean(writeReason)} onSelect={() => actions.openDelete(source)}>
          <Trash2 aria-hidden />
          <MenuItemLabel reason={writeReason}>Delete</MenuItemLabel>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
