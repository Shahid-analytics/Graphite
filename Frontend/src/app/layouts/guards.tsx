import { Navigate, Outlet, useLocation, useParams } from 'react-router'
import { ErrorState } from '@/components/feedback/states'
import { Logo } from '@/components/logo/logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/use-auth'
import { lastWorkspaceId, rememberWorkspace, useWorkspaceQuery, WorkspaceProvider } from '@/hooks/use-workspace'
import { isApiError } from '@/services/api-error'
import { useEffect } from 'react'

export function FullPageLoader({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3" aria-busy="true">
      <Logo variant="icon" size={32} className="animate-pulse text-foreground" />
      <span className="text-sm text-muted-foreground">{label}…</span>
    </div>
  )
}

/** Blocks routes until a session exists. Production auth is enforced by the backend. */
export function RequireAuth() {
  const { session, isLoading, error } = useAuth()
  const location = useLocation()
  if (isLoading) return <FullPageLoader label="Checking your session" />
  if (error) {
    return (
      <div className="mx-auto max-w-lg p-6 pt-24">
        <ErrorState error={error} title="Could not verify your session" onRetry={() => window.location.reload()} />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** Redirects "/" to the last used workspace, the workspace picker, or sign-in. */
export function RootRedirect() {
  const { session, isLoading } = useAuth()
  if (isLoading) return <FullPageLoader />
  if (!session) return <Navigate to="/login" replace />
  const last = lastWorkspaceId()
  const target = session.memberships.find((m) => m.workspace_id === last) ?? (session.memberships.length === 1 ? session.memberships[0] : null)
  return <Navigate to={target ? `/w/${target.workspace_id}` : '/workspaces'} replace />
}

/** Loads the workspace in the URL and provides it to all nested routes. */
export function WorkspaceGate() {
  const { workspaceId } = useParams()
  const query = useWorkspaceQuery(workspaceId)

  useEffect(() => {
    if (query.data) rememberWorkspace(query.data.id)
  }, [query.data])

  if (query.isLoading) return <FullPageLoader label="Opening workspace" />
  if (query.isError || !query.data) {
    const status = isApiError(query.error) ? query.error.status : 0
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6 pt-24">
        <ErrorState
          error={query.error}
          title={status === 403 ? 'You do not have access to this workspace' : status === 404 ? 'Workspace not found' : 'Could not open the workspace'}
          onRetry={status >= 500 || status === 0 ? () => query.refetch() : undefined}
        />
        <div className="text-center">
          <Button asChild variant="outline">
            <a href="/workspaces">Choose another workspace</a>
          </Button>
        </div>
      </div>
    )
  }
  return (
    <WorkspaceProvider workspace={query.data}>
      <Outlet />
    </WorkspaceProvider>
  )
}
