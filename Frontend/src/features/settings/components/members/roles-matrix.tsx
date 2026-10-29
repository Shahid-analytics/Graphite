import { Check, Minus } from 'lucide-react'
import { Fragment } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { RoleDefinition } from '@/types'
import { PERMISSION_GROUPS, ROLE_LABELS } from '../../lib/labels'

/** Permissions x roles matrix, driven by the role definitions the API reports. */
export function RolesMatrix({ roles }: { roles: RoleDefinition[] }) {
  return (
    <div className="rounded-lg border border-border bg-background">
      <Table>
        <caption className="sr-only">Permissions granted to each role</caption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="min-w-56">Permission</TableHead>
            {roles.map((role) => (
              <TableHead key={role.role} className="min-w-36 align-bottom">
                <span className="block normal-case">
                  <span className="block text-xs font-semibold text-foreground">{ROLE_LABELS[role.role]}</span>
                  <span className="mt-0.5 block max-w-44 text-[11px] leading-snug font-normal tracking-normal whitespace-normal text-muted-foreground">{role.description}</span>
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {PERMISSION_GROUPS.map((group) => (
            <Fragment key={group.label}>
              <TableRow className="bg-surface hover:bg-surface">
                <TableCell colSpan={roles.length + 1} className="py-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </TableCell>
              </TableRow>
              {group.permissions.map((permission) => (
                <TableRow key={permission.key}>
                  <TableCell>
                    <span className="block text-sm">{permission.label}</span>
                    <span className="block text-xs whitespace-normal text-muted-foreground">{permission.description}</span>
                    <span className="block font-mono text-[11px] text-subtle-foreground">{permission.key}</span>
                  </TableCell>
                  {roles.map((role) => {
                    const granted = role.permissions.includes(permission.key)
                    return (
                      <TableCell key={role.role}>
                        {granted ? (
                          <Check role="img" className="size-4 text-foreground" aria-label={`${ROLE_LABELS[role.role]}: granted`} />
                        ) : (
                          <Minus role="img" className="size-4 text-border-strong" aria-label={`${ROLE_LABELS[role.role]}: not granted`} />
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
            </Fragment>
          ))}
          <TableRow className="hover:bg-transparent">
            <TableCell className="text-sm">View dashboards, catalog and run history</TableCell>
            {roles.map((role) => (
              <TableCell key={role.role}>
                <Check role="img" className="size-4 text-foreground" aria-label={`${ROLE_LABELS[role.role]}: granted`} />
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
    </div>
  )
}
