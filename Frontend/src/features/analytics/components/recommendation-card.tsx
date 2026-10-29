import { FilePenLine, Lightbulb } from 'lucide-react'
import { ConfidenceMeter } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import type { ReportRecommendation } from '@/types'
import { ReportDefinition } from './report-definition'
import { WithReason } from './with-reason'

export function RecommendationCard({
  workspaceId,
  recommendation,
  index,
  canSave,
  onReview,
}: {
  workspaceId: string
  recommendation: ReportRecommendation
  index: number
  canSave: boolean
  onReview: () => void
}) {
  const titleId = `rec-${recommendation.id}-title`
  return (
    <article aria-labelledby={titleId} className="flex min-w-0 flex-col rounded-lg border border-border bg-background shadow-xs">
      <header className="flex flex-col gap-2 border-b border-border px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">Recommendation {index + 1}</p>
          <h3 id={titleId} className="text-sm font-semibold">
            {recommendation.title}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{recommendation.description}</p>
        </div>
        <div className="shrink-0">
          <p className="sr-only">Confidence</p>
          <ConfidenceMeter value={recommendation.confidence} />
        </div>
      </header>
      <div className="space-y-4 px-4 py-3">
        <ReportDefinition
          workspaceId={workspaceId}
          dataset={recommendation.dataset}
          visualization={recommendation.visualization}
          dimensions={recommendation.dimensions}
          measures={recommendation.measures}
          filters={recommendation.filters}
        />
        <div className="flex gap-2 rounded-md bg-surface px-3 py-2 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p>
            <span className="font-medium">Why this: </span>
            <span className="text-muted-foreground">{recommendation.rationale}</span>
          </p>
        </div>
      </div>
      <footer className="mt-auto flex justify-end border-t border-border px-4 py-3">
        <WithReason reason={canSave ? null : 'Your role does not include the reports:write permission, so you cannot save report drafts.'}>
          <Button size="sm" onClick={onReview} disabled={!canSave}>
            <FilePenLine aria-hidden />
            Review and save as draft
          </Button>
        </WithReason>
      </footer>
    </article>
  )
}
