import { AlertTriangle, ShieldCheck, XCircle } from 'lucide-react'
import { EmptyState } from '@/components/feedback/states'
import { LayerBadge } from '@/components/status/status-badge'
import { Progress } from '@/components/ui/progress'
import { wsPath } from '@/hooks/use-workspace'
import { formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { QualitySummary } from '@/types'
import { CardLink, CtaLink, MetaDot, OverviewCard, PanelList, PanelRow, RowLink } from './overview-card'

const TOP_FAILING = 4

function Count({ label, value, tone }: { label: string; value: number; tone?: 'danger' | 'warning' }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('text-sm font-semibold tabular', value > 0 && tone === 'danger' && 'text-danger', value > 0 && tone === 'warning' && 'text-warning')}>
        {formatNumber(value)}
      </dd>
    </div>
  )
}

export function QualityCard({ quality, workspaceId, className }: { quality: QualitySummary; workspaceId: string; className?: string }) {
  const executed = quality.passed + quality.failed + quality.warning
  const top = quality.failing_checks.slice(0, TOP_FAILING)
  const indicator = quality.failed ? 'bg-danger' : quality.warning ? 'bg-warning' : 'bg-success'

  return (
    <OverviewCard
      title="Data quality"
      help="dbt tests (not null, unique, accepted values, relationships) and freshness checks. The pass rate counts executed checks; warnings do not block downstream models, failures with error severity do."
      className={className}
      action={<CardLink to={wsPath(workspaceId, 'models')}>Data models</CardLink>}
    >
      {quality.total === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title="No quality checks yet"
          description="Checks are defined with your dbt models and run after each transformation."
          action={
            <CtaLink to={wsPath(workspaceId, 'transformations')} permission="transformations:write" deniedReason="Defining transformations requires the editor or admin role.">
              Set up transformations
            </CtaLink>
          }
        />
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-2xl font-semibold tracking-tight">{executed ? formatPercent(quality.pass_rate) : '—'}</p>
              <p className="text-xs text-muted-foreground">
                pass rate across {formatNumber(executed)} executed {executed === 1 ? 'check' : 'checks'}
              </p>
            </div>
            <Progress
              value={executed ? quality.pass_rate * 100 : 0}
              className="mt-2"
              indicatorClassName={indicator}
              aria-label={`Quality pass rate ${executed ? formatPercent(quality.pass_rate) : 'not available'}`}
            />
          </div>

          <dl className="grid grid-cols-4 gap-2">
            <Count label="Passed" value={quality.passed} />
            <Count label="Failed" value={quality.failed} tone="danger" />
            <Count label="Warnings" value={quality.warning} tone="warning" />
            <Count label="Not run" value={quality.not_run} />
          </dl>

          {top.length ? (
            <div>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">Top failing checks</h3>
              <PanelList label="Top failing checks">
                {top.map((check) => (
                  <PanelRow
                    key={check.id}
                    leading={
                      check.status === 'failed' ? (
                        <XCircle className="size-4 text-danger" aria-label="Failed" />
                      ) : (
                        <AlertTriangle className="size-4 text-warning" aria-label="Warning" />
                      )
                    }
                    title={<span className="block truncate">{check.name}</span>}
                    meta={
                      <>
                        <LayerBadge layer={check.layer} className="h-4 px-1 text-[10px]" />
                        <RowLink to={wsPath(workspaceId, 'models', check.model_id)} className="truncate font-mono">
                          {check.model_name}
                          {check.column ? `.${check.column}` : ''}
                        </RowLink>
                      </>
                    }
                    trailing={
                      check.failing_rows > 0 ? (
                        <span className="tabular">
                          {formatNumber(check.failing_rows)} {check.failing_rows === 1 ? 'row' : 'rows'}
                        </span>
                      ) : null
                    }
                  />
                ))}
              </PanelList>
              {quality.failing_checks.length > TOP_FAILING ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {quality.failing_checks.length - TOP_FAILING} more failing or warning
                  <MetaDot /> open the model pages for details
                </p>
              ) : null}
            </div>
          ) : executed ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 text-success" aria-hidden />
              All executed checks passed.
            </p>
          ) : null}
        </div>
      )}
    </OverviewCard>
  )
}
