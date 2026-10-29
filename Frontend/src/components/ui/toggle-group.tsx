import * as React from 'react'
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui'

import { cn } from '@/lib/utils'

type ToggleGroupSize = 'default' | 'sm'

const ToggleGroupContext = React.createContext<{ size: ToggleGroupSize }>({ size: 'default' })

function ToggleGroup({
  className,
  size = 'default',
  children,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & { size?: ToggleGroupSize }) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      data-size={size}
      className={cn(
        'inline-flex w-fit items-center gap-0.5 rounded-md border border-border bg-surface-2 p-0.5',
        className,
      )}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  )
}

function ToggleGroupItem({ className, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  const { size } = React.useContext(ToggleGroupContext)
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      data-size={size}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-sm px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none',
        'data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:px-2.5 data-[size=sm]:text-xs',
        'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20',
        'data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm',
        "disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem }
