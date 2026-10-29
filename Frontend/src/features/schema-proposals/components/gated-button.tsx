import type { ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Button that stays visible but disabled when `blockedReason` is set, explaining why
 * (missing permission, wrong status) in a tooltip reachable by keyboard.
 */
export function GatedButton({ blockedReason, children, ...props }: ButtonProps & { blockedReason?: string | null; children: ReactNode }) {
  if (!blockedReason) return <Button {...props}>{children}</Button>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none">
          <Button {...props} disabled tabIndex={-1}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{blockedReason}</TooltipContent>
    </Tooltip>
  )
}

export const PERMISSION_REASONS = {
  propose: 'Your role does not include the "models:propose" permission. Ask a workspace admin or editor.',
  approve: 'Approving and applying schema changes requires the "models:approve" permission (admins and owners).',
}
