import type { ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Wraps a control that is disabled for a known reason (missing permission, unsaved
 * changes) so the reason is available on hover and keyboard focus.
 */
export function DisabledReason({ reason, children }: { reason: string | null | undefined; children: ReactNode }) {
  if (!reason) return <>{children}</>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/20" aria-label={reason}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}

/** Button that is disabled with an explanation when `blockedReason` is set. */
export function GatedButton({ blockedReason, disabled, ...props }: ButtonProps & { blockedReason?: string | null }) {
  if (!blockedReason) return <Button disabled={disabled} {...props} />
  return (
    <DisabledReason reason={blockedReason}>
      <Button {...props} disabled />
    </DisabledReason>
  )
}
