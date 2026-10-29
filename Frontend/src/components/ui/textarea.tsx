import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-xs transition-[color,border-color,box-shadow] outline-none',
        'placeholder:text-subtle-foreground',
        'hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20',
        'disabled:cursor-not-allowed disabled:bg-surface disabled:opacity-60',
        'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
