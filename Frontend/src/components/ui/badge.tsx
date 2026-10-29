import * as React from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-xs leading-4 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/20 [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'border-border bg-background text-foreground',
        solid: 'border-transparent bg-primary text-primary-foreground',
        success: 'border-success/15 bg-success-soft text-success',
        warning: 'border-warning/15 bg-warning-soft text-warning',
        danger: 'border-danger/15 bg-danger-soft text-danger',
        info: 'border-info/15 bg-info-soft text-info',
        running: 'border-running/15 bg-running-soft text-running',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type BadgeProps = React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span'
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
export type { BadgeProps }
