import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Keeps clicks and key presses on inline controls from triggering the surrounding row action. */
export function StopPropagation({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex', className)} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      {children}
    </span>
  )
}
