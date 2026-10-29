import * as React from 'react'

import { cn } from '@/lib/utils'

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'pointer-events-none inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-sm border border-border bg-surface px-1 font-sans text-[11px] font-medium text-muted-foreground shadow-xs select-none',
        "[&_svg:not([class*='size-'])]:size-3",
        className,
      )}
      {...props}
    />
  )
}

export { Kbd }
