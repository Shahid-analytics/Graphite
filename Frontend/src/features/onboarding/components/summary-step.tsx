import { ArrowRight, CheckCircle2, Circle, GitBranch, LayoutDashboard, Settings, Sparkles, Users, Workflow } from 'lucide-react'
import { Link } from 'react-router'
import { Notice } from '@/components/feedback/notice'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useWorkspace, wsPath } from '@/hooks/use-workspace'
import { cn } from '@/lib/utils'
import type { OnboardingStepKey } from '@/types'
import { completedCount, ONBOARDING_KEYS, stepIndex, WIZARD_STEPS, type WizardStepKey } from '../lib/steps'
import type { CreatedSource } from '../lib/draft'
import { StepFooter, StepHeader } from './step-frame'

const DETAILS: Record<OnboardingStepKey, { done: string; pending: string; link: { label: string; segments: string[] } }> = {
  source: {
    done: 'A source connection has been tested and created.',
    pending: 'No source has been created yet.',
    link: { label: 'Data Sources', segments: ['sources'] },
  },
  destination: {
    done: 'The PostgreSQL warehouse and its Bronze, Silver and Gold schemas are configured.',
    pending: 'The warehouse connection is not configured, so ingestion has nowhere to load data.',
    link: { label: 'Warehouse settings', segments: ['settings', 'connections'] },
  },
  ingestion: {
    done: 'Tables are selected and an initial sync has been queued into Bronze.',
    pending: 'No tables are being ingested yet.',
    link: { label: 'Data Sources', segments: ['sources'] },
  },
  transformation: {
    done: 'The dbt project is linked and passed its connection test.',
    pending: 'No dbt project is linked, so Silver and Gold models cannot be built.',
    link: { label: 'dbt project settings', segments: ['settings', 'dbt'] },
  },
  analytics: {
    done: 'Metabase is connected and verified for dashboards and reports.',
    pending: 'Metabase is not connected and verified yet. Dashboards cannot be embedded or published until it is.',
    link: { label: 'Metabase settings', segments: ['settings', 'metabase'] },
  },
}

const NEXT_STEPS = [
  { icon: Workflow, title: 'Build a pipeline', description: 'Chain ingestion, dbt and quality checks into one scheduled run.', segments: ['pipelines'] },
  { icon: GitBranch, title: 'Review transformations', description: 'See the dbt models that build Silver and Gold tables.', segments: ['transformations'] },
  { icon: Sparkles, title: 'Map your business data', description: 'Review AI-assisted mappings from raw tables to business entities.', segments: ['transformations', 'mapping'] },
  { icon: LayoutDashboard, title: 'Explore analytics', description: 'Browse dashboards and get report recommendations.', segments: ['analytics'] },
  { icon: Users, title: 'Invite your team', description: 'Add members and choose their roles.', segments: ['settings', 'members'] },
  { icon: Settings, title: 'Review settings', description: 'Scheduler defaults, notifications, AI provider and audit retention.', segments: ['settings'] },
]

export function SummaryStep({ created, onGoTo }: { created: CreatedSource | null; onGoTo: (key: WizardStepKey) => void }) {
  const { workspace, workspaceId } = useWorkspace()
  const done = completedCount(workspace.onboarding)
  const total = ONBOARDING_KEYS.length

  return (
    <>
      <StepHeader stepKey="summary" />

      <div className="mb-6 flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {done === total ? 'Setup complete' : `${done} of ${total} setup steps complete`}
          </p>
          <Progress value={done} max={total} className="mt-2" aria-label="Setup progress" />
        </div>
      </div>

      {done < total ? (
        <Notice tone="neutral" className="mb-6">
          Pending steps stay on the overview checklist. You can return to this guided setup at any time.
        </Notice>
      ) : null}

      <ol className="divide-y divide-border rounded-lg border border-border" aria-label="Setup checklist">
        {ONBOARDING_KEYS.map((key) => {
          const complete = workspace.onboarding.steps[key]
          const step = WIZARD_STEPS[stepIndex(key)]
          const detail = DETAILS[key]
          return (
            <li key={key} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {complete ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Configured" />
                ) : (
                  <Circle className="mt-0.5 size-4 shrink-0 text-subtle-foreground" aria-label="Pending" />
                )}
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium', !complete && 'text-muted-foreground')}>{step.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {complete ? detail.done : detail.pending}
                    {key === 'ingestion' && created ? ` Source: ${created.source.name}.` : ''}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2 pl-7 sm:pl-0">
                {complete ? null : (
                  <Button type="button" variant="outline" size="sm" onClick={() => onGoTo(key)}>
                    Set up now
                  </Button>
                )}
                <Button asChild variant="ghost" size="sm">
                  <Link to={wsPath(workspaceId, ...detail.link.segments)}>{detail.link.label}</Link>
                </Button>
              </div>
            </li>
          )
        })}
      </ol>

      <section aria-labelledby="next-heading" className="mt-8">
        <h2 id="next-heading" className="mb-3 text-sm font-semibold">
          Where to go next
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {NEXT_STEPS.map((item) => {
            const Icon = item.icon
            return (
              <li key={item.title}>
                <Link
                  to={wsPath(workspaceId, ...item.segments)}
                  className="flex h-full items-start gap-3 rounded-lg border border-border bg-background p-4 transition-colors outline-none hover:border-border-strong focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
                >
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span>
                    <span className="block text-sm font-medium">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{item.description}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </section>

      <StepFooter
        start={
          <Button type="button" variant="ghost" onClick={() => onGoTo('analytics')}>
            Back
          </Button>
        }
      >
        <Button asChild>
          <Link to={wsPath(workspace.id)}>
            Go to overview
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </StepFooter>
    </>
  )
}
