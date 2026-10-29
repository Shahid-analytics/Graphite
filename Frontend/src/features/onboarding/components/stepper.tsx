import { Check } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { WIZARD_STEPS, type WizardStepKey } from '../lib/steps'

const LOCKED_HINT = 'Complete or skip the earlier steps to open this one.'

interface StepperProps {
  active: WizardStepKey
  isDone: (key: WizardStepKey) => boolean
  isReachable: (key: WizardStepKey) => boolean
  onSelect: (key: WizardStepKey) => void
}

/** Vertical step list (desktop). Completed and already reached steps can be revisited. */
export function Stepper({ active, isDone, isReachable, onSelect }: StepperProps) {
  return (
    <nav aria-label="Setup steps" className="hidden lg:block">
      <ol className="relative">
        {WIZARD_STEPS.map((step, index) => {
          const done = isDone(step.key)
          const current = step.key === active
          const reachable = isReachable(step.key)
          const last = index === WIZARD_STEPS.length - 1
          return (
            <li key={step.key} className="relative pb-6 last:pb-0">
              {!last ? <span className={cn('absolute top-8 bottom-0 left-[13px] w-px', done ? 'bg-foreground/40' : 'bg-border')} aria-hidden /> : null}
              <button
                type="button"
                onClick={() => onSelect(step.key)}
                disabled={!reachable}
                title={reachable ? undefined : LOCKED_HINT}
                aria-current={current ? 'step' : undefined}
                className="group relative flex w-full items-start gap-3 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed"
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular transition-colors',
                    current && 'border-primary bg-primary text-primary-foreground',
                    !current && done && 'border-foreground/40 bg-background text-foreground',
                    !current && !done && 'border-border bg-background text-subtle-foreground',
                  )}
                >
                  {done && !current ? <Check className="size-3.5" aria-hidden /> : index + 1}
                </span>
                <span className="min-w-0 pt-1">
                  <span
                    className={cn(
                      'block text-sm',
                      current ? 'font-semibold text-foreground' : reachable ? 'text-foreground group-hover:underline' : 'text-subtle-foreground',
                    )}
                  >
                    {step.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{done ? 'Completed' : current ? 'In progress' : !reachable ? 'Locked' : step.key === 'summary' ? 'Review' : 'Not started'}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** Compact horizontal progress for small screens. */
export function MobileStepper({ active, isDone, isReachable, onSelect }: StepperProps) {
  const index = WIZARD_STEPS.findIndex((s) => s.key === active)
  const step = WIZARD_STEPS[index]
  return (
    <nav aria-label="Setup steps" className="lg:hidden">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium">
          Step {index + 1} of {WIZARD_STEPS.length}: {step.label}
        </span>
      </div>
      <Progress value={index + 1} max={WIZARD_STEPS.length} className="mt-2" aria-label="Setup progress" />
      <ol className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
        {WIZARD_STEPS.map((s, i) => {
          const done = isDone(s.key)
          const current = s.key === active
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                disabled={!isReachable(s.key)}
                title={isReachable(s.key) ? undefined : LOCKED_HINT}
                aria-current={current ? 'step' : undefined}
                aria-label={`Step ${i + 1}: ${s.label}${done ? ', completed' : isReachable(s.key) ? '' : ', locked until earlier steps are done'}`}
                className={cn(
                  'flex size-7 items-center justify-center rounded-full border text-xs font-semibold tabular outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50',
                  current ? 'border-primary bg-primary text-primary-foreground' : done ? 'border-foreground/40 text-foreground' : 'border-border text-subtle-foreground',
                )}
              >
                {done && !current ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
