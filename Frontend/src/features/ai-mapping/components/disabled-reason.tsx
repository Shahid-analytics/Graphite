import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Wraps a control that may be disabled. When `reason` is set the control is shown
 * inside a focusable wrapper with a tooltip explaining why it is unavailable.
 */
export function DisabledReason({ reason, children, className }: { reason: string | null | undefined; children: ReactNode; className?: string }) {
  if (!reason) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className={className ?? 'inline-flex rounded-md'} aria-label={reason}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  )
}
