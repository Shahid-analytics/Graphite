import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Button that stays visible but disabled when the user lacks a permission, with
 * the reason in a tooltip. The wrapper keeps the tooltip reachable by keyboard
 * because disabled buttons do not receive focus or pointer events.
 */
export function PermissionButton({
  allowed,
  reason,
  ...props
}: ComponentProps<typeof Button> & { allowed: boolean; reason: string }) {
  if (allowed) return <Button {...props} />
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none">
          <Button {...props} disabled />
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  )
}
