import { CheckCheck, Undo2 } from 'lucide-react'
import { StatTile } from '@/components/data/display'
import { ConfidenceMeter } from '@/components/status/simulated'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { formatPercent } from '@/lib/format'
import { BULK_ACCEPT_THRESHOLD } from '../lib/labels'
import type { DecisionCounts } from '../lib/review'
import { DisabledReason } from './disabled-reason'

export function ReviewSummary({
  counts,
  averageConfidence,
  bulkEligible,
  unsavedCount,
  lockedReason,
  onBulkAccept,
  onDiscard,
}: {
  counts: DecisionCounts
  averageConfidence: number | null
  bulkEligible: number
  unsavedCount: number
  lockedReason: string | null
  onBulkAccept: () => void
  onDiscard: () => void
}) {
  const decided = counts.total - counts.pending
  const bulkReason = lockedReason ?? (bulkEligible === 0 ? `No pending suggestions have confidence of ${formatPercent(BULK_ACCEPT_THRESHOLD, 0)} or more.` : null)
  return (
    <section aria-label="Review summary" className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Pending" value={counts.pending} hint={counts.pending ? 'Need a decision' : 'All decided'} tone={counts.pending ? 'warning' : undefined} />
        <StatTile label="Accepted" value={counts.accepted} />
        <StatTile label="Modified" value={counts.modified} />
        <StatTile label="Rejected" value={counts.rejected} />
        <StatTile
          label="Average confidence"
          value={averageConfidence === null ? '—' : formatPercent(averageConfidence, 0)}
          hint={averageConfidence === null ? undefined : <ConfidenceMeter value={averageConfidence} />}
          className="col-span-2 sm:col-span-1"
        />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 md:flex-row md:items-center">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-sm">
            <span className="font-medium tabular">
              {decided} of {counts.total}
            </span>{' '}
            <span className="text-muted-foreground">suggestions decided</span>
            {unsavedCount ? (
              <span className="ml-2 text-xs font-medium text-warning" aria-live="polite">
                {unsavedCount} unsaved {unsavedCount === 1 ? 'change' : 'changes'}
              </span>
            ) : null}
          </p>
          <Progress value={counts.total ? (decided / counts.total) * 100 : 0} aria-label="Review progress" className="max-w-md" />
        </div>
        <div className="flex flex-wrap gap-2">
          {unsavedCount ? (
            <Button variant="ghost" size="sm" onClick={onDiscard}>
              <Undo2 aria-hidden />
              Discard changes
            </Button>
          ) : null}
          <DisabledReason reason={bulkReason}>
            <Button variant="outline" size="sm" onClick={onBulkAccept} disabled={Boolean(bulkReason)}>
              <CheckCheck aria-hidden />
              Accept all with confidence &gt;= {formatPercent(BULK_ACCEPT_THRESHOLD, 0)}
              {bulkEligible ? <span className="tabular text-muted-foreground">({bulkEligible})</span> : null}
            </Button>
          </DisabledReason>
        </div>
      </div>
    </section>
  )
}
