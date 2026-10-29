import { Building2, ChevronRight, MapPin, Plus } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { EmptyState, ErrorState } from '@/components/feedback/states'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { rememberWorkspace, useWorkspacesQuery, wsPath } from '@/hooks/use-workspace'
import type { Workspace } from '@/types'
import { AccountLayout } from '../components/account-layout'
import { PLAN_LABELS, ROLE_LABELS } from '../lib/constants'

const STEP_COUNT = 5

function stepsDone(workspace: Workspace) {
  return Object.values(workspace.onboarding.steps).filter(Boolean).length
}

function WorkspaceRow({ workspace, onOpen }: { workspace: Workspace; onOpen: (workspace: Workspace) => void }) {
  const done = stepsDone(workspace)
  const complete = Boolean(workspace.onboarding.completed_at) || done === STEP_COUNT
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(workspace)}
        className="group flex w-full flex-col gap-4 rounded-lg border border-border bg-background px-5 py-4 text-left shadow-xs transition-colors outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 sm:flex-row sm:items-center"
      >
        <span className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-sm font-semibold" aria-hidden>
            {workspace.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold">{workspace.name}</span>
              <Badge variant="outline">{PLAN_LABELS[workspace.plan]}</Badge>
              <Badge variant={workspace.current_user_role === 'owner' ? 'solid' : 'default'}>{ROLE_LABELS[workspace.current_user_role]}</Badge>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3" aria-hidden />
                {workspace.industry ?? 'Industry not set'}
              </span>
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden />
                {workspace.region}
              </span>
            </span>
          </span>
        </span>
        <span className="flex items-center gap-4 sm:w-56">
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{complete ? 'Setup complete' : done === 0 ? 'Setup not started' : 'Setup in progress'}</span>
              <span className="tabular font-medium">
                {done}/{STEP_COUNT}
              </span>
            </span>
            <Progress value={done} max={STEP_COUNT} className="mt-1.5" aria-label={`${workspace.name} setup progress`} />
          </span>
          <ChevronRight className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </button>
    </li>
  )
}

function ListSkeleton() {
  return (
    <ul className="space-y-3" aria-busy="true" aria-label="Loading workspaces">
      {Array.from({ length: 2 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-lg border border-border bg-background px-5 py-4">
          <Skeleton className="size-10 rounded-md" />
          <span className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </span>
          <Skeleton className="hidden h-3 w-40 sm:block" />
        </li>
      ))}
    </ul>
  )
}

export default function WorkspacesPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const query = useWorkspacesQuery()

  const open = (workspace: Workspace) => {
    rememberWorkspace(workspace.id)
    navigate(stepsDone(workspace) === 0 && !workspace.onboarding.dismissed ? wsPath(workspace.id, 'onboarding') : wsPath(workspace.id))
  }

  const createButton = (
    <Button asChild>
      <Link to="/workspaces/new">
        <Plus className="size-4" aria-hidden />
        Create workspace
      </Link>
    </Button>
  )

  return (
    <AccountLayout>
      <PageHeader
        title="Choose a workspace"
        description={session ? `Signed in as ${session.user.email}. Each workspace has its own sources, warehouse and dashboards.` : undefined}
        actions={query.data?.length ? createButton : undefined}
      />
      {query.isLoading ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} title="Could not load your workspaces" onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyState
          icon={Building2}
          title="You are not a member of any workspace yet"
          description="Ask a workspace owner to invite you, or create a new workspace for your business."
          action={createButton}
        />
      ) : (
        <ul className="space-y-3" aria-label="Your workspaces">
          {query.data.map((workspace) => (
            <WorkspaceRow key={workspace.id} workspace={workspace} onOpen={open} />
          ))}
        </ul>
      )}
    </AccountLayout>
  )
}
