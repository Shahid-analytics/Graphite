import { AlertTriangle, Clock, GitCompareArrows, Layers, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { StatTile } from '@/components/data/display'
import { CardsSkeleton, ErrorState } from '@/components/feedback/states'
import { Notice } from '@/components/feedback/notice'
import { TimeAgo } from '@/components/data/display'
import { Button } from '@/components/ui/button'
import { wsPath } from '@/hooks/use-workspace'
import { formatNumber, formatPercent } from '@/lib/format'
import type { DataModel, QualitySummary } from '@/types'
import { LAYER_LABEL, LAYERS, describeSchemaChange, qualifiedName, unacknowledged } from '../lib/labels'

/** Compact quality and freshness strip above the catalog. */
export function CatalogSummary({
  models,
  summary,
  summaryError,
  onRetrySummary,
}: {
  models: DataModel[]
  summary: QualitySummary | undefined
  summaryError: unknown
  onRetrySummary: () => void
}) {
  if (summaryError) {
    return <ErrorState compact error={summaryError} title="Could not load the quality summary" onRetry={onRetrySummary} />
  }
  if (!summary) return <CardsSkeleton count={5} className="sm:grid-cols-3 xl:grid-cols-5" />

  const byLayer = LAYERS.map((layer) => `${LAYER_LABEL[layer]} ${models.filter((m) => m.layer === layer).length}`).join(' · ')
  const changes = models.reduce((sum, m) => sum + unacknowledged(m).length, 0)
  const executed = summary.passed + summary.failed + summary.warning
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
      <StatTile label="Models" value={formatNumber(models.length)} hint={byLayer} icon={<Layers className="size-3.5" aria-hidden />} className="col-span-2 sm:col-span-1" />
      <StatTile
        label="Quality pass rate"
        value={executed ? formatPercent(summary.pass_rate) : '—'}
        hint={executed ? `${summary.passed} of ${executed} executed checks` : 'No checks have run yet'}
        tone={!executed ? undefined : summary.pass_rate >= 0.95 ? 'success' : summary.pass_rate >= 0.85 ? 'warning' : 'danger'}
        icon={<ShieldCheck className="size-3.5" aria-hidden />}
      />
      <StatTile
        label="Failing checks"
        value={formatNumber(summary.failed)}
        hint={`${summary.warning} warning${summary.warning === 1 ? '' : 's'} · ${summary.not_run} not run`}
        tone={summary.failed ? 'danger' : undefined}
        icon={<AlertTriangle className="size-3.5" aria-hidden />}
      />
      <StatTile
        label="Stale models"
        value={formatNumber(summary.stale_models)}
        hint="Past their freshness SLA"
        tone={summary.stale_models ? 'warning' : undefined}
        icon={<Clock className="size-3.5" aria-hidden />}
      />
      <StatTile
        label="Schema changes"
        value={formatNumber(changes)}
        hint="Detected, not yet acknowledged"
        tone={changes ? 'warning' : undefined}
        icon={<GitCompareArrows className="size-3.5" aria-hidden />}
      />
    </div>
  )
}

/** Warning listing tables whose upstream schema drifted and nobody has acknowledged it yet. */
export function SchemaDriftNotice({
  models,
  workspaceId,
  filtered,
  onShowAffected,
}: {
  models: DataModel[]
  workspaceId: string
  filtered: boolean
  onShowAffected: () => void
}) {
  const affected = models.filter((m) => unacknowledged(m).length)
  if (!affected.length) return null
  return (
    <Notice
      tone="warning"
      title={`Schema drift detected in ${affected.length} table${affected.length === 1 ? '' : 's'}`}
      action={
        filtered ? null : (
          <Button variant="outline" size="sm" onClick={onShowAffected}>
            Show affected tables
          </Button>
        )
      }
    >
      <p>Source columns changed since the last load. Review the downstream models, then acknowledge each change on the table page.</p>
      <ul className="mt-2 space-y-1">
        {affected.flatMap((model) =>
          unacknowledged(model).map((change) => (
            <li key={change.id} className="flex flex-wrap items-baseline gap-x-2">
              <Link to={wsPath(workspaceId, 'models', model.id)} className="font-mono text-xs font-medium text-foreground underline-offset-2 hover:underline">
                {qualifiedName(model)}
              </Link>
              <span>{describeSchemaChange(change)}</span>
              <span className="text-xs text-subtle-foreground">
                Detected <TimeAgo value={change.detected_at} />
              </span>
            </li>
          )),
        )}
      </ul>
    </Notice>
  )
}
