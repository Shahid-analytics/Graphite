import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Notice } from '@/components/feedback/notice'
import { PageHeader } from '@/components/layout/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePermission, useWorkspace } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { Permission } from '@/types'
import { stepIndex, WIZARD_STEPS, type WizardStepKey } from '../lib/steps'

/** Step heading: uses PageHeader so every wizard screen starts the same way. */
export function StepHeader({ stepKey, done, actions }: { stepKey: WizardStepKey; done?: boolean; actions?: ReactNode }) {
  const index = stepIndex(stepKey)
  const step = WIZARD_STEPS[index]
  return (
    <PageHeader
      title={step.title}
      description={step.description}
      actions={actions}
      className="mb-6"
      meta={
        <>
          <Badge variant="outline" className="tabular">
            Step {index + 1} of {WIZARD_STEPS.length}
          </Badge>
          {done ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden />
              Completed
            </Badge>
          ) : null}
        </>
      }
    />
  )
}

/** Bottom action bar for a step. Secondary actions on the left, primary on the right. */
export function StepFooter({ start, children, className }: { start?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('mt-8 flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">{start}</div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">{children}</div>
    </div>
  )
}

/** Returns whether the user may complete a step, plus an explanation when not. */
export function useStepAccess(permission: Permission | null, action: string) {
  const { workspace } = useWorkspace()
  const allowed = usePermission(permission ?? 'settings:manage') || permission === null
  return {
    allowed,
    notice: allowed ? null : (
      <Notice tone="neutral" icon={Lock} title="View only" className="mb-6">
        Your role ({workspace.current_user_role}) cannot {action}. Ask a workspace owner or admin to complete this step, or skip it
        for now.
      </Notice>
    ),
  }
}

/** Small titled group of related fields inside a step. */
export function FieldGroup({ title, description, children, className }: { title: string; description?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('min-w-0 rounded-lg border border-border bg-background p-4 sm:p-5', className)}>
      <legend className="float-left w-full text-sm font-semibold">{title}</legend>
      {description ? <p className="clear-both pt-0.5 text-xs text-muted-foreground">{description}</p> : null}
      <div className="clear-both pt-4">{children}</div>
    </fieldset>
  )
}

export interface StepNavProps {
  /** Moves to the previous step; null on the first step. */
  onBack: (() => void) | null
  /** Moves to the next step without marking this one complete. */
  onNext: () => void
  done: boolean
}

/** Back and skip controls shared by every configurable step. */
export function StepNav({ onBack, onNext, done }: StepNavProps) {
  return (
    <>
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4" aria-hidden />
          Back
        </Button>
      ) : null}
      <Button type="button" variant="ghost" onClick={onNext} className="text-muted-foreground">
        {done ? 'Next step' : 'Skip for now'}
      </Button>
    </>
  )
}
