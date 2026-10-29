import { UserPlus, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState, ErrorState, TableSkeleton } from '@/components/feedback/states'
import { Section } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { FilterSelect, SearchInput, TableToolbar } from '@/components/tables/data-table'
import { useAuth } from '@/hooks/use-auth'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { GatedButton } from '../components/gated-button'
import { InviteDialog } from '../components/members/invite-dialog'
import { MembersTable } from '../components/members/members-table'
import { RolesMatrix } from '../components/members/roles-matrix'
import { PERMISSION_REASON } from '../lib/labels'
import { useMembers, useRoles } from '../queries'

export default function MembersSettingsPage() {
  const { workspaceId } = useWorkspace()
  const { session } = useAuth()
  const canManage = usePermission('members:manage')
  const members = useMembers(workspaceId)
  const roles = useRoles(workspaceId)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [q, setQ] = useState('')
  const [role, setRole] = useState('all')
  const [status, setStatus] = useState('all')

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (members.data ?? []).filter(
      (m) =>
        (role === 'all' || m.role === role) &&
        (status === 'all' || m.status === status) &&
        (!needle || m.user.name.toLowerCase().includes(needle) || m.user.email.toLowerCase().includes(needle)),
    )
  }, [members.data, q, role, status])

  const inviteButton = (
    <GatedButton size="sm" onClick={() => setInviteOpen(true)} blockedReason={canManage ? null : PERMISSION_REASON.members}>
      <UserPlus aria-hidden />
      Invite member
    </GatedButton>
  )

  const invitedCount = members.data?.filter((m) => m.status === 'invited').length ?? 0
  const activeCount = (members.data?.length ?? 0) - invitedCount

  return (
    <div className="space-y-8">
      <Section
        title="Members"
        description={
          members.data
            ? `${activeCount} active ${activeCount === 1 ? 'member' : 'members'}${invitedCount ? `, ${invitedCount} pending ${invitedCount === 1 ? 'invitation' : 'invitations'}` : ''}. Roles control what each person can change; the backend enforces them on every request.`
            : 'People with access to this workspace and their roles.'
        }
        action={inviteButton}
      >
        {members.isLoading ? (
          <TableSkeleton rows={5} columns={5} />
        ) : members.isError ? (
          <ErrorState error={members.error} onRetry={() => members.refetch()} />
        ) : (
          <>
            {(members.data?.length ?? 0) > 1 ? (
              <TableToolbar>
                <SearchInput value={q} onChange={setQ} placeholder="Search members" />
                <FilterSelect
                  label="Roles"
                  value={role}
                  onChange={setRole}
                  options={[
                    { value: 'owner', label: 'Owner' },
                    { value: 'admin', label: 'Admin' },
                    { value: 'editor', label: 'Editor' },
                    { value: 'viewer', label: 'Viewer' },
                  ]}
                />
                <FilterSelect
                  label="Statuses"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: 'active', label: 'Active' },
                    { value: 'invited', label: 'Invited' },
                  ]}
                />
              </TableToolbar>
            ) : null}
            <MembersTable
              workspaceId={workspaceId}
              members={filtered}
              currentUserId={session?.user.id ?? null}
              canManage={canManage}
              empty={
                members.data?.length ? (
                  <EmptyState icon={Users} title="No members match these filters" description="Clear the search or filters to see everyone." compact />
                ) : (
                  <EmptyState icon={Users} title="No members yet" description="Invite colleagues to review data, build reports and manage pipelines." action={inviteButton} />
                )
              }
            />
          </>
        )}
      </Section>

      <Section title="Roles and permissions" description="What each role can do in this workspace. Every role can view dashboards, the catalog and run history.">
        {roles.isLoading ? (
          <TableSkeleton rows={8} columns={5} />
        ) : roles.isError ? (
          <ErrorState error={roles.error} onRetry={() => roles.refetch()} />
        ) : roles.data?.length ? (
          <RolesMatrix roles={roles.data} />
        ) : (
          <EmptyState
            title="No role definitions"
            description="The API did not return any roles for this workspace. Try again, or contact support if this persists."
            action={
              <Button variant="outline" size="sm" onClick={() => roles.refetch()}>
                Try again
              </Button>
            }
          />
        )}
      </Section>

      <InviteDialog workspaceId={workspaceId} open={inviteOpen} onOpenChange={setInviteOpen} roles={roles.data} />
    </div>
  )
}
