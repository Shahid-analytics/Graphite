import { ChevronRight } from 'lucide-react'
import { HelpTip } from '@/components/data/display'
import { STAGE_META, STAGE_ORDER } from '@/components/runs/labels'

/** Compact explainer of what a pipeline run does, end to end. */
export function FlowExplainer() {
  return (
    <section aria-labelledby="flow-explainer-title" className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 id="flow-explainer-title" className="text-xs font-medium text-muted-foreground">
          What a pipeline run does
        </h2>
        <HelpTip label="About pipelines">
          A pipeline chains every step from a source to the dashboards. A source sync job runs only the first three stages; a dbt run covers the
          transformation stages. Quality checks and the Metabase refresh are optional per pipeline.
        </HelpTip>
      </div>
      <ol className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-2">
        {STAGE_ORDER.map((key, index) => {
          const meta = STAGE_META[key]
          const Icon = meta.icon
          return (
            <li key={key} className="flex items-center gap-1">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-xs">
                <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                {meta.short}
                <HelpTip label={`About ${meta.name}`}>{meta.description}</HelpTip>
              </span>
              {index < STAGE_ORDER.length - 1 ? <ChevronRight className="size-3.5 text-subtle-foreground" aria-hidden /> : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
