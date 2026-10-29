import { Check, Loader2, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { TimeAgo } from '@/components/data/display'
import { cn } from '@/lib/utils'
import type { Run, SchemaProposal } from '@/types'

type StepState = 'done' | 'current' | 'upcoming' | 'failed' | 'active'

interface Step {
  key: string
  label: string
  state: StepState
  detail?: ReactNode
}

const ORDER: Record<string, number> = { draft: 0, pending_review: 1, approved: 2, applying: 3, applied: 4 }

function Who({ name, at }: { name: string; at: string | null }) {
  return (
    <>
      {name}
      {at ? (
        <>
          {' · '}
          <TimeAgo value={at} />
        </>
      ) : null}
    </>
  )
}

function buildSteps(p: SchemaProposal, run: Run | undefined): Step[] {
  const changesRequested = p.status === 'draft' && p.reviewed_by
  const draft: Step = {
    key: 'draft',
    label: changesRequested ? 'Draft (changes requested)' : 'Draft',
    state: p.status === 'draft' ? 'current' : 'done',
    detail: changesRequested ? (
      <>
        Returned by <Who name={p.reviewed_by!.name} at={p.reviewed_at} />
      </>
    ) : (
      <>
        Created by <Who name={p.created_by.name} at={p.created_at} />
      </>
    ),
  }

  if (p.status === 'rejected') {
    return [
      draft,
      { key: 'review', label: 'Pending review', state: 'done', detail: 'Submitted for review' },
      {
        key: 'rejected',
        label: 'Rejected',
        state: 'failed',
        detail: p.reviewed_by ? (
          <>
            By <Who name={p.reviewed_by.name} at={p.reviewed_at} />
          </>
        ) : null,
      },
    ]
  }

  const at = ORDER[p.status]
  const state = (index: number): StepState => (at > index ? 'done' : at === index ? 'current' : 'upcoming')
  const applyFailed = p.status === 'approved' && run?.status === 'failed'

  return [
    draft,
    {
      key: 'review',
      label: 'Pending review',
      state: state(1),
      detail: at === 1 ? 'Waiting for an admin to approve, reject or request changes' : at > 1 ? 'Submitted for review' : null,
    },
    {
      key: 'approved',
      label: 'Approved',
      state: applyFailed ? 'done' : state(2),
      detail:
        at >= 2 && p.reviewed_by ? (
          <>
            By <Who name={p.reviewed_by.name} at={p.reviewed_at} />
          </>
        ) : null,
    },
    {
      key: 'applying',
      label: 'Applying',
      state: p.status === 'applying' ? 'active' : applyFailed ? 'failed' : state(3),
      detail: applyFailed ? (
        <span className="text-danger">The last apply attempt failed. The proposal is still approved and can be applied again.</span>
      ) : run && at >= 3 ? (
          <>
            Started by <Who name={run.triggered_by.name} at={run.queued_at} />
          </>
        ) : null,
    },
    {
      key: 'applied',
      label: 'Applied',
      state: p.status === 'applied' ? 'done' : 'upcoming',
      detail: p.status === 'applied' ? run?.finished_at ? <TimeAgo value={run.finished_at} /> : 'Models created or altered by dbt' : null,
    },
  ]
}

function Marker({ state }: { state: StepState }) {
  const base = 'relative z-10 flex size-5 shrink-0 items-center justify-center rounded-full border'
  if (state === 'done') {
    return (
      <span className={cn(base, 'border-primary bg-primary text-primary-foreground')}>
        <Check className="size-3" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (state === 'failed') {
    return (
      <span className={cn(base, 'border-danger bg-danger text-white')}>
        <X className="size-3" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className={cn(base, 'border-running bg-running-soft text-running')}>
        <Loader2 className="size-3 animate-spin" aria-hidden />
      </span>
    )
  }
  if (state === 'current') return <span className={cn(base, 'border-foreground bg-background')}><span className="size-2 rounded-full bg-foreground" /></span>
  return <span className={cn(base, 'border-border-strong bg-background')} />
}

const STATE_LABEL: Record<StepState, string> = { done: 'completed', current: 'current step', upcoming: 'not reached', failed: 'failed', active: 'in progress' }

export function StatusTimeline({ proposal, applyRun }: { proposal: SchemaProposal; applyRun?: Run }) {
  const steps = buildSteps(proposal, applyRun)
  return (
    <ol className="space-y-0" aria-label="Proposal status">
      {steps.map((step, i) => (
        <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
          {i < steps.length - 1 ? (
            <span aria-hidden className={cn('absolute top-5 bottom-0 left-[9.5px] w-px', step.state === 'done' ? 'bg-primary' : 'bg-border')} />
          ) : null}
          <Marker state={step.state} />
          <div className="min-w-0 pt-px">
            <p className={cn('text-sm', step.state === 'upcoming' ? 'text-muted-foreground' : 'font-medium', step.state === 'failed' && 'text-danger')}>
              {step.label}
              <span className="sr-only"> ({STATE_LABEL[step.state]})</span>
            </p>
            {step.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{step.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
