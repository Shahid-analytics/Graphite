import { ChartColumn, Database, Layers, Sparkles, Workflow, type LucideIcon } from 'lucide-react'
import { Logo } from '@/components/logo/logo'

const FLOW: { icon: LucideIcon; label: string; detail: string }[] = [
  { icon: Database, label: 'Sources', detail: 'Salesforce, PostgreSQL and more' },
  { icon: Layers, label: 'Bronze', detail: 'Raw records loaded by dlt' },
  { icon: Workflow, label: 'dbt', detail: 'Versioned, tested transformations' },
  { icon: Layers, label: 'Silver and Gold', detail: 'Clean tables and business models' },
  { icon: ChartColumn, label: 'Metabase', detail: 'Dashboards and reports' },
]

/** Left-hand brand panel on the sign-in screen. Hidden below the lg breakpoint. */
export function LoginHero() {
  return (
    <aside className="relative hidden flex-col justify-between bg-sidebar px-12 py-10 text-sidebar-foreground lg:flex xl:px-16" aria-label="About Graphite">
      <Logo className="text-white" wordmarkClassName="text-white" size={26} />

      <div className="max-w-md">
        <h2 className="text-[28px] leading-tight font-semibold tracking-tight text-white">
          Affordable, end-to-end business intelligence for growing businesses.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-sidebar-muted">
          Connect your systems, model your data in a governed warehouse and give every team trustworthy dashboards, without
          assembling a data stack yourself.
        </p>

        <ol className="mt-10" aria-label="How data flows through Graphite">
          {FLOW.map((step, index) => {
            const Icon = step.icon
            const last = index === FLOW.length - 1
            return (
              <li key={step.label} className="relative flex gap-4 pb-5 last:pb-0">
                {!last ? <span className="absolute top-9 bottom-0 left-[17px] w-px bg-sidebar-border" aria-hidden /> : null}
                <span className="relative flex size-9 shrink-0 items-center justify-center rounded-md border border-sidebar-border bg-sidebar-active text-white">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="pt-1">
                  <span className="block text-sm font-medium text-white">{step.label}</span>
                  <span className="block text-xs text-sidebar-muted">{step.detail}</span>
                </span>
              </li>
            )
          })}
        </ol>

        <div className="mt-10 flex items-start gap-3 rounded-lg border border-sidebar-border px-4 py-3.5">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-white" aria-hidden />
          <p className="text-sm">
            <span className="font-medium text-white">AI-assisted business mapping and report recommendations.</span>{' '}
            <span className="text-sidebar-muted">Suggestions are always reviewed by your team before they are used.</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-sidebar-muted">Built for MSMEs: distributors, retailers and manufacturers.</p>
    </aside>
  )
}
