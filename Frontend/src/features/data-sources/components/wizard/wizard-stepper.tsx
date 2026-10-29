import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export const WIZARD_STEPS = ['Connector', 'Configure', 'Tables', 'Schedule', 'Review'] as const

/** Step indicator. Completed steps are buttons so users can go back. */
export function WizardStepper({ current, onSelect }: { current: number; onSelect: (step: number) => void }) {
  return (
    <nav aria-label="Setup progress" className="mb-5">
      <p className="mb-2 text-xs text-muted-foreground sm:hidden">
        Step {current + 1} of {WIZARD_STEPS.length}: <span className="font-medium text-foreground">{WIZARD_STEPS[current]}</span>
      </p>
      <ol className="flex items-center gap-1 sm:gap-2">
        {WIZARD_STEPS.map((label, index) => {
          const done = index < current
          const active = index === current
          const content = (
            <>
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular',
                  done && 'border-foreground bg-foreground text-background',
                  active && 'border-foreground text-foreground',
                  !done && !active && 'border-border-strong text-muted-foreground',
                )}
                aria-hidden
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className={cn('sr-only text-sm sm:not-sr-only', active ? 'font-medium text-foreground' : 'text-muted-foreground')}>{label}</span>
            </>
          )
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2" aria-current={active ? 'step' : undefined}>
              {done ? (
                <button type="button" onClick={() => onSelect(index)} className="flex items-center gap-2 rounded-md outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/20" aria-label={`Go back to ${label}`}>
                  {content}
                </button>
              ) : (
                <span className="flex items-center gap-2">{content}</span>
              )}
              {index < WIZARD_STEPS.length - 1 ? <span className={cn('h-px min-w-3 flex-1', done ? 'bg-foreground' : 'bg-border')} aria-hidden /> : null}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
