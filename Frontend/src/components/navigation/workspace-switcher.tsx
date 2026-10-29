import { Check, ChevronsUpDown, Plus } from 'lucide-react'
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
import { rememberWorkspace, useWorkspace, useWorkspacesQuery, wsPath } from '@/hooks/use-workspace'
import { initials } from '@/lib/utils'

export function WorkspaceSwitcher() {
  const { workspace } = useWorkspace()
  const workspaces = useWorkspacesQuery()
  const navigate = useNavigate()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 min-w-0 max-w-[220px] shrink gap-2 px-2" aria-label={`Workspace: ${workspace.name}. Switch workspace`}>
          <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary text-[10px] font-semibold text-primary-foreground">
            {initials(workspace.name)}
          </span>
          <span className="truncate font-medium">{workspace.name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Workspaces</DropdownMenuLabel>
        {workspaces.data?.map((ws) => (
          <DropdownMenuItem
            key={ws.id}
            onSelect={() => {
              rememberWorkspace(ws.id)
              navigate(wsPath(ws.id))
            }}
          >
            <span className="flex size-5 items-center justify-center rounded-sm bg-surface-2 text-[10px] font-semibold">{initials(ws.name)}</span>
            <span className="flex-1 truncate">{ws.name}</span>
            <span className="text-[11px] capitalize text-muted-foreground">{ws.current_user_role}</span>
            {ws.id === workspace.id ? <Check className="size-3.5" aria-label="Current workspace" /> : null}
          </DropdownMenuItem>
        ))}
        {workspaces.isLoading ? <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p> : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/workspaces/new')}>
          <Plus className="size-4" aria-hidden />
          Create workspace
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/workspaces')}>All workspaces</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
