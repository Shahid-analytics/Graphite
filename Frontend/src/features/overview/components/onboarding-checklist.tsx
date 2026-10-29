import { ArrowRight, Check, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { ConfirmDialog } from '@/components/dialogs/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePermission, wsPath } from '@/hooks/use-workspace'
import { toastError, toastSuccess } from '@/lib/toast'
import { cn } from '@/lib/utils'
import type { Workspace } from '@/types'
import { useDismissOnboarding } from '../queries'
import { ONBOARDING_STEPS } from './labels'

export function shouldShowOnboarding(workspace: Workspace) {
  return !workspace.onboarding.completed_at && !workspace.onboarding.dismissed
}

/** Setup checklist shown until every onboarding step is done or the user hides it. */
export function OnboardingChecklist({ workspace }: { workspace: Workspace }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const dismiss = useDismissOnboarding(workspace.id)
  // Hiding the checklist affects everyone in the workspace, so it is a workspace setting.
  const canHide = usePermission('settings:manage')
  const steps = ONBOARDING_STEPS.map((step) => ({ ...step, done: workspace.onboarding.steps[step.key] }))
  const doneCount = steps.filter((s) => s.done).length
  const nextStep = steps.find((s) => !s.done)
  const fresh = doneCount === 0

  return (
    <Card role="region" aria-labelledby="onboarding-title" className={cn('px-5 py-4', fresh && 'border-border-strong')}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <h2 id="onboarding-title" className="text-sm font-semibold">
            {fresh ? `Set up ${workspace.name}` : 'Finish setting up your workspace'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {fresh
              ? 'Connect a source, load it into the warehouse and publish your first dashboard. The guided setup takes you through each step.'
              : `${doneCount} of ${steps.length} steps complete.${nextStep ? ` Next: ${nextStep.title.toLowerCase()}.` : ''}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild size="sm">
            <Link to={wsPath(workspace.id, 'onboarding')}>
              {fresh ? 'Start guided setup' : 'Continue setup'}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
          {canHide ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Hide setup checklist" onClick={() => setConfirmOpen(true)}>
                  <X aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Hide setup checklist</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  tabIndex={0}
                  className="inline-flex rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
                  aria-label={`Hide setup checklist unavailable: your role (${workspace.current_user_role}) cannot change workspace settings`}
                >
                  <Button variant="ghost" size="icon-sm" disabled tabIndex={-1} aria-hidden>
                    <X aria-hidden />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Only owners and admins can hide the setup checklist, because it is hidden for everyone in the workspace. Your role (
                {workspace.current_user_role}) cannot change workspace settings.
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <Progress
        value={doneCount}
        max={steps.length}
        className="mt-4"
        aria-label={`Setup progress: ${doneCount} of ${steps.length} steps complete`}
      />

      <ol className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {steps.map((step, index) => (
          <li
            key={step.key}
            className={cn(
              'flex gap-2.5 rounded-md border px-3 py-2.5',
              step.done ? 'border-border bg-surface' : step === nextStep ? 'border-border-strong bg-background' : 'border-border bg-background',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-medium tabular',
                step.done ? 'border-success/30 bg-success-soft text-success' : 'border-border-strong text-muted-foreground',
              )}
              aria-hidden
            >
              {step.done ? <Check className="size-3" /> : index + 1}
            </span>
            <div className="min-w-0">
              <p className={cn('text-sm font-medium', step.done && 'text-muted-foreground')}>
                {step.title}
                <span className="sr-only">{step.done ? ' (done)' : ' (not done)'}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Hide the setup checklist?"
        description="The checklist will no longer appear on the overview for anyone in this workspace. Guided setup stays available from the onboarding page."
        confirmLabel="Hide checklist"
        onConfirm={async () => {
          try {
            await dismiss.mutateAsync()
            toastSuccess('Setup checklist hidden')
          } catch (error) {
            toastError(error, 'Could not hide the checklist')
            throw error
          }
        }}
      />
    </Card>
  )
}
