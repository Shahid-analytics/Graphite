import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, type ReactNode } from 'react'
import { workspaceService } from '@/services/workspace.service'
import type { Permission, Workspace } from '@/types'

interface WorkspaceContextValue {
  workspace: Workspace
  workspaceId: string
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export const workspaceKeys = {
  all: ['workspaces'] as const,
  detail: (id: string) => ['workspaces', id] as const,
  onboarding: (id: string) => ['workspaces', id, 'onboarding'] as const,
}

const LAST_WORKSPACE_KEY = 'graphite.lastWorkspace'

export function rememberWorkspace(id: string) {
  try {
    localStorage.setItem(LAST_WORKSPACE_KEY, id)
  } catch {
    // Non-essential preference.
  }
}

export function lastWorkspaceId() {
  try {
    return localStorage.getItem(LAST_WORKSPACE_KEY)
  } catch {
    return null
  }
}

export function useWorkspacesQuery() {
  return useQuery({ queryKey: workspaceKeys.all, queryFn: workspaceService.list })
}

export function useWorkspaceQuery(id: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.detail(id ?? ''),
    queryFn: () => workspaceService.get(id!),
    enabled: Boolean(id),
  })
}

export function WorkspaceProvider({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  return <WorkspaceContext.Provider value={{ workspace, workspaceId: workspace.id }}>{children}</WorkspaceContext.Provider>
}

/** The active workspace. Only available inside workspace-scoped routes. */
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used inside a workspace route')
  return ctx
}

/**
 * Permission check for rendering role-dependent UI. The backend still enforces
 * authorization on every request; this only hides or disables controls.
 */
export function usePermission(permission: Permission) {
  const { workspace } = useWorkspace()
  return workspace.permissions.includes(permission)
}

/** Builds a workspace-scoped path, e.g. wsPath(id, 'sources') -> /w/:id/sources. */
export function wsPath(workspaceId: string, ...segments: (string | number)[]) {
  return `/w/${workspaceId}${segments.length ? `/${segments.join('/')}` : ''}`
}
