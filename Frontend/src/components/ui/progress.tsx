import * as React from 'react'
import { Progress as ProgressPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

function Progress({
  className,
  indicatorClassName,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const pct = value == null ? 0 : Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn('h-full w-full flex-1 rounded-full bg-primary transition-transform duration-300', indicatorClassName)}
        style={{ transform: `translateX(-${100 - pct}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
