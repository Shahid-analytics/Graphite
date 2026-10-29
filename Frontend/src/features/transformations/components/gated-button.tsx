import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Button that stays visible but disabled when an action is not allowed, with the
 * reason available on hover and keyboard focus.
 */
export function GatedButton({
  allowed,
  reason,
  ...props
}: ComponentProps<typeof Button> & { allowed: boolean; reason: string }) {
  if (allowed) return <Button {...props} />
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:outline-none">
          <Button {...props} disabled tabIndex={-1} />
          <span className="sr-only">{reason}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  )
}

export const PERMISSION_REASONS = {
  run: 'Your role does not include the "transformations:run" permission. Ask a workspace editor or admin to run dbt.',
  write: 'Your role does not include the "transformations:write" permission. Ask a workspace editor or admin to change model code.',
} as const
