import { ShieldCheck } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useWorkspace } from '@/hooks/use-workspace'
import { toastError } from '@/lib/toast'
import type { OnboardingStepKey } from '@/types'
import { AnalyticsStep } from '../components/analytics-step'
import { DestinationStep } from '../components/destination-step'
import { IngestionStep } from '../components/ingestion-step'
import { OnboardingTopBar } from '../components/onboarding-top-bar'
import { SourceStep } from '../components/source-step'
import type { StepNavProps } from '../components/step-frame'
import { MobileStepper, Stepper } from '../components/stepper'
import { SummaryStep } from '../components/summary-step'
import { TransformationStep } from '../components/transformation-step'
import { newDraftId, type CreatedSource, type SourceDraft } from '../lib/draft'
import { completedCount, firstIncompleteStep, ONBOARDING_KEYS, stepIndex, WIZARD_STEPS, type WizardStepKey } from '../lib/steps'
import { useCompleteOnboardingStep } from '../queries'

export default function OnboardingPage() {
  const { workspace, workspaceId } = useWorkspace()
  const completeStep = useCompleteOnboardingStep(workspaceId)
  const [active, setActive] = useState<WizardStepKey>(() => firstIncompleteStep(workspace.onboarding))
  const [furthest, setFurthest] = useState(() => stepIndex(firstIncompleteStep(workspace.onboarding)))
  // Tested connection (including secrets) for step 3. Component state only; cleared once the source exists.
  const [draft, setDraft] = useState<SourceDraft | null>(null)
  const [created, setCreated] = useState<CreatedSource | null>(null)
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo({ top: 0 })
    mainRef.current?.focus({ preventScroll: true })
  }, [active])

  const allDone = completedCount(workspace.onboarding) === ONBOARDING_KEYS.length
  // A tested draft counts as done locally; the backend records the source step once the source exists.
  const isDone = (key: WizardStepKey) => (key === 'summary' ? allDone : workspace.onboarding.steps[key] || (key === 'source' && draft !== null))
  const isReachable = (key: WizardStepKey) => isDone(key) || stepIndex(key) <= furthest

  const goTo = (key: WizardStepKey) => {
    setActive(key)
    setFurthest((prev) => Math.max(prev, stepIndex(key)))
  }

  const navFor = (key: WizardStepKey): StepNavProps => {
    const index = stepIndex(key)
    return {
      onBack: index > 0 ? () => goTo(WIZARD_STEPS[index - 1].key) : null,
      onNext: () => goTo(WIZARD_STEPS[Math.min(index + 1, WIZARD_STEPS.length - 1)].key),
      done: isDone(key),
    }
  }

  /** Records a completed step with the backend. Returns false (after a toast) on failure. */
  const markDone = async (key: OnboardingStepKey) => {
    try {
      await completeStep.mutateAsync(key)
      return true
    } catch (error) {
      toastError(error, 'Could not record setup progress')
      return false
    }
  }

  const completeAndAdvance = async (key: OnboardingStepKey) => {
    if (await markDone(key)) navFor(key).onNext()
  }

  /*
   * A passing connection test only moves the wizard on. The source step is recorded
   * with the backend when the source is created in step 3, so the workspace never
   * reports a connected source that does not exist.
   */
  const onSourceContinue = (next: Omit<SourceDraft, 'id'>) => {
    setDraft({ ...next, id: newDraftId() })
    setCreated(null)
    goTo('destination')
  }

  const onSourceCreated = async (result: CreatedSource) => {
    setCreated(result)
    // The source now exists on the backend; drop every credential held by the wizard.
    setDraft(null)
    if (await markDone('source')) await markDone('ingestion')
  }

  let content: ReactNode
  switch (active) {
    case 'source':
      content = <SourceStep draft={draft} onContinue={onSourceContinue} nav={navFor('source')} />
      break
    case 'destination':
      content = <DestinationStep nav={navFor('destination')} onSaved={() => completeAndAdvance('destination')} />
      break
    case 'ingestion':
      content = <IngestionStep draft={draft} created={created} nav={navFor('ingestion')} onCreated={onSourceCreated} onGoToSource={() => goTo('source')} />
      break
    case 'transformation':
      content = <TransformationStep nav={navFor('transformation')} markDone={() => markDone('transformation')} />
      break
    case 'analytics':
      content = <AnalyticsStep nav={navFor('analytics')} markDone={() => markDone('analytics')} />
      break
    default:
      content = <SummaryStep created={created} onGoTo={goTo} />
  }

  const stepperProps = { active, isDone, isReachable, onSelect: goTo }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <OnboardingTopBar workspace={workspace} />
      <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14 lg:px-8 lg:py-10">
        <aside className="lg:sticky lg:top-28 lg:self-start">
          <Stepper {...stepperProps} />
          <MobileStepper {...stepperProps} />
          <p className="mt-10 hidden items-start gap-2 text-xs leading-relaxed text-muted-foreground lg:flex">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            Progress is saved after each step. Credentials are sent once to the backend and never stored in your browser.
          </p>
        </aside>
        <main id="main" ref={mainRef} tabIndex={-1} className="min-w-0 max-w-3xl outline-none" aria-label={`${WIZARD_STEPS[stepIndex(active)].label} step`}>
          {content}
        </main>
      </div>
    </div>
  )
}
