import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Wraps a control that may be disabled and explains why on hover or focus.
 * Disabled buttons do not receive pointer or focus events, so the tooltip is
 * attached to a focusable wrapper instead. Renders the child as-is when `reason` is empty.
 */
export function DisabledReason({ reason, children }: { reason: ReactNode | null | undefined | false; children: ReactNode }) {
  if (!reason) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:outline-2">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  )
}
