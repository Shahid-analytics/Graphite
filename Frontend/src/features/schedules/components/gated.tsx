import { useId, type ReactElement } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Permission } from '@/types'

const ROLES_WITH: Partial<Record<Permission, string>> = {
  'schedules:write': 'editors, admins and owners',
  'pipelines:run': 'editors, admins and owners',
  'sources:sync': 'editors, admins and owners',
  'transformations:run': 'editors, admins and owners',
}

/** Explanation shown on controls the current role cannot use. */
export function permissionReason(permission: Permission) {
  const who = ROLES_WITH[permission]
  return `Requires the "${permission}" permission${who ? ` (${who})` : ''}. Ask a workspace admin to change your role.`
}

/**
 * Wraps a control that is disabled for a reason the user should see. Disabled
 * buttons do not receive pointer or focus events, so the tooltip is attached to a
 * focusable wrapper instead. The wrapper keeps the control's own name (from its
 * content) and exposes the reason as its description, kept outside the wrapper so
 * it is not read as part of the name.
 */
export function Gated({ allowed, reason, children }: { allowed: boolean; reason: string; children: ReactElement }) {
  const reasonId = useId()
  if (allowed) return children
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none" aria-describedby={reasonId}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{reason}</TooltipContent>
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </>
  )
}
