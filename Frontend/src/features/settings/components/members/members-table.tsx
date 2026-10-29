import { UserMinus } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { TimeAgo } from '@/components/data/display'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { DataTable, type Column } from '@/components/tables/data-table'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toastError, toastSuccess } from '@/lib/toast'
import type { Member, Role } from '@/types'
import { ROLE_LABELS } from '../../lib/labels'
import { useRemoveMember, useUpdateMember } from '../../queries'
import { DisabledReason } from '../gated-button'

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

const ROLE_RANK: Record<Role, number> = { owner: 0, admin: 1, editor: 2, viewer: 3 }

export function MembersTable({
  workspaceId,
  members,
  currentUserId,
  canManage,
  empty,
}: {
  workspaceId: string
  members: Member[]
  currentUserId: string | null
  canManage: boolean
  empty: ReactNode
}) {
  const update = useUpdateMember(workspaceId)
  const remove = useRemoveMember(workspaceId)
  const [removing, setRemoving] = useState<Member | null>(null)

  const changeRole = async (member: Member, role: Exclude<Role, 'owner'>) => {
    try {
      await update.mutateAsync({ userId: member.user.id, payload: { role } })
      toastSuccess(`${member.user.name} is now ${ROLE_LABELS[role].toLowerCase()}`)
    } catch (error) {
      toastError(error, 'Could not change the role')
    }
  }

  /** Why the row cannot be edited, or null when it can. */
  const lockReason = (member: Member) => {
    if (!canManage) return 'Requires the members:manage permission'
    if (member.role === 'owner') return 'The owner role cannot be changed. Ownership transfers are handled by support.'
    if (member.user.id === currentUserId) return 'You cannot change your own role or remove yourself'
    return null
  }

  const columns: Column<Member>[] = [
    {
      id: 'name',
      header: 'Member',
      sortValue: (m) => m.user.name.toLowerCase(),
      cell: (m) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar className="size-7">
            <AvatarFallback className="text-[11px]">{initials(m.user.name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {m.user.name}
              {m.user.id === currentUserId ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
            </p>
            <p className="truncate text-xs text-muted-foreground md:hidden">{m.user.email}</p>
          </div>
        </div>
      ),
    },
    { id: 'email', header: 'Email', hideOnMobile: true, sortValue: (m) => m.user.email, cell: (m) => <span className="text-muted-foreground">{m.user.email}</span> },
    {
      id: 'role',
      header: 'Role',
      sortValue: (m) => ROLE_RANK[m.role],
      cell: (m) => {
        const reason = lockReason(m)
        if (reason) {
          return (
            <DisabledReason reason={canManage ? reason : null}>
              <Badge variant={m.role === 'owner' ? 'solid' : 'outline'}>{ROLE_LABELS[m.role]}</Badge>
            </DisabledReason>
          )
        }
        const pending = update.isPending && update.variables?.userId === m.user.id
        return (
          <Select value={m.role} onValueChange={(value) => changeRole(m, value as Exclude<Role, 'owner'>)} disabled={pending}>
            <SelectTrigger size="sm" className="w-28" aria-label={`Role for ${m.user.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(['admin', 'editor', 'viewer'] as const).map((role) => (
                <SelectItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      },
    },
    {
      id: 'status',
      header: 'Status',
      sortValue: (m) => m.status,
      cell: (m) => (m.status === 'active' ? <Badge variant="success">Active</Badge> : <Badge variant="info">Invited</Badge>),
    },
    {
      id: 'last_active',
      header: 'Last active',
      hideOnMobile: true,
      sortValue: (m) => m.last_active_at ?? '',
      cell: (m) => (m.status === 'invited' ? <span className="text-xs text-muted-foreground">Invitation pending</span> : <TimeAgo value={m.last_active_at} className="text-muted-foreground" />),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'w-12 text-right',
      cell: (m) => {
        const reason = lockReason(m)
        const label = m.status === 'invited' ? `Revoke invitation for ${m.user.email}` : `Remove ${m.user.name}`
        return (
          <DisabledReason reason={reason}>
            <Button variant="ghost" size="icon-sm" aria-label={label} disabled={Boolean(reason)} onClick={() => setRemoving(m)}>
              <UserMinus className="size-4" aria-hidden />
            </Button>
          </DisabledReason>
        )
      },
    },
  ]

  const invited = removing?.status === 'invited'

  return (
    <>
      <DataTable columns={columns} rows={members} getRowId={(m) => m.user.id} pageSize={20} empty={empty} caption="Workspace members" />
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        title={invited ? 'Revoke invitation?' : `Remove ${removing?.user.name ?? 'member'}?`}
        description={
          invited
            ? `${removing?.user.email} will no longer be able to join this workspace with this invitation.`
            : `${removing?.user.name} loses access to this workspace immediately. Their past actions stay in the audit trail. You can invite them again later.`
        }
        confirmLabel={invited ? 'Revoke invitation' : 'Remove member'}
        destructive
        onConfirm={async () => {
          if (!removing) return
          try {
            await remove.mutateAsync(removing.user.id)
            toastSuccess(invited ? 'Invitation revoked' : `${removing.user.name} was removed`)
          } catch (error) {
            toastError(error, invited ? 'Could not revoke the invitation' : 'Could not remove the member')
            throw error
          }
        }}
      />
    </>
  )
}
