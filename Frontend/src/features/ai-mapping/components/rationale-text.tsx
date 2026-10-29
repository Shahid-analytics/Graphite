import { useState } from 'react'
import { cn } from '@/lib/utils'

/** Rationale clamped to two lines with an inline toggle for long text. */
export function RationaleText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > 90
  return (
    <div className={cn('max-w-xs text-xs text-muted-foreground', className)}>
      <p className={cn(!open && long && 'line-clamp-2')}>{text}</p>
      {long ? (
        <button
          type="button"
          className="mt-0.5 text-[11px] font-medium text-foreground underline-offset-2 hover:underline"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation()
            setOpen((v) => !v)
          }}
        >
          {open ? 'Show less' : 'Show rationale'}
        </button>
      ) : null}
    </div>
  )
}
